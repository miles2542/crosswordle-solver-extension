<script lang="ts">
    import { fade, slide } from "svelte/transition";
    import { boardStore, forceSyncBoard } from "../core/boardState";

    // State Machine Types
    type Mode = "cell" | "rowcol" | "full";
    type Phase = "idle" | "selecting" | "ready" | "revealing";

    let currentMode: Mode = "cell";
    let currentPhase: Phase = "idle";
    let targetSelection: string | number | null = null; // Holds cellId, rowIndex, or colIndex



    function setMode(mode: Mode) {
        if (currentPhase === "revealing") return; // Lock mode changes while animating
        currentMode = mode;
        currentPhase = "idle";
        targetSelection = null;

        // Dispatches event to Chunk 4 (Visual Overlay) to clear any active UI tabs/highlights
        window.dispatchEvent(new CustomEvent("cw-clear-overlays"));
    }

    // --- Action Handlers ---

    function handlePrimaryAction() {
        forceSyncBoard(); // Proactive sync for v1.0.7 robustness
        if (currentMode === "cell" || currentMode === "rowcol") {
            currentPhase = "selecting";
            // Inform Chunk 4 to activate hover states and gutter tabs
            window.dispatchEvent(
                new CustomEvent("cw-activate-selection", {
                    detail: { mode: currentMode },
                }),
            );
        } else if (currentMode === "full") {
            currentPhase = "ready"; // Skip selection for full board
        }
    }

    function handleRevealAction() {
        if (currentMode === "full" && currentPhase !== "ready") return;

        forceSyncBoard(); // Final sync before reveal
        currentPhase = "revealing";
        
        // Extract raw target and axis if it's an object (RowCol mode)
        const target = typeof targetSelection === 'object' && targetSelection !== null 
            ? (targetSelection as any).target 
            : targetSelection;
        const axis = typeof targetSelection === 'object' && targetSelection !== null 
            ? (targetSelection as any).axis 
            : null;

        window.dispatchEvent(
            new CustomEvent("cw-start-reveal", {
                detail: { mode: currentMode, target, axis },
            }),
        );
    }

    function handleCancel() {
        currentPhase = "idle";
        targetSelection = null;
        window.dispatchEvent(new CustomEvent("cw-clear-overlays"));
    }

    // Listen for selections coming from Chunk 4 (when user clicks a cell or gutter tab)
    window.addEventListener("cw-selection-made", (e: Event) => {
        const customEvent = e as CustomEvent;
        // Capture full detail for accurate RowCol filtering in v1.0.8
        targetSelection = customEvent.detail.target;
        if (customEvent.detail.axis) {
            (targetSelection as any) = { target: customEvent.detail.target, axis: customEvent.detail.axis };
        }
        currentPhase = "ready";
    });

    window.addEventListener("cw-clear-overlays", () => {
        currentPhase = "idle";
        targetSelection = null;
    });
</script>

<div class="dock-container" transition:fade={{ duration: 200 }}>
    <div class="dock-header">
        <span class="status-indicator" class:solved={$boardStore.isSolved}
        ></span>
        <span class="status-text"
            >{$boardStore.isSolved ? "Matrix Solved" : "Matrix Active"}</span
        >
        <button
            class="icon-btn sync-btn"
            on:click={forceSyncBoard}
            title="Force Sync DOM"
        >
            ↻
        </button>
    </div>

    <div
        class="segmented-control"
        class:disabled={currentPhase === "revealing" ||
            currentPhase === "selecting"}
    >
        <button
            class:active={currentMode === "cell"}
            on:click={() => setMode("cell")}>Cell</button
        >
        <button
            class:active={currentMode === "rowcol"}
            on:click={() => setMode("rowcol")}>Row/Col</button
        >
        <button
            class:active={currentMode === "full"}
            on:click={() => setMode("full")}>Full</button
        >
    </div>

    <div class="action-row">
        {#if currentPhase === "idle"}
            {#if currentMode === "full"}
                <button class="primary-btn" on:click={handlePrimaryAction}
                    >Solve Full Board</button
                >
            {:else}
                <button
                    class="primary-btn outline"
                    on:click={handlePrimaryAction}
                >
                    Select {currentMode === "cell" ? "Cell" : "Axis"}
                </button>
            {/if}
        {:else if currentPhase === "selecting"}
            <div class="instruction-text" in:fade>
                Select a {currentMode === "cell"
                    ? "cell on the board"
                    : "row/col gutter tab"}...
            </div>
            <button class="cancel-btn" on:click={handleCancel}>✕</button>
        {:else if currentPhase === "ready"}
            {#if currentMode === "full"}
                <button
                    class="primary-btn warning"
                    on:click={handleRevealAction}
                    in:slide
                >
                    Confirm Full Reveal
                </button>
            {:else}
                <button
                    class="primary-btn success"
                    on:click={handleRevealAction}
                    in:fade
                >
                    Reveal Sequence ⏵
                </button>
            {/if}
            <button class="cancel-btn" on:click={handleCancel}>✕</button>
        {:else if currentPhase === "revealing"}
            <div class="instruction-text cyan" in:fade>
                Routing optimal path...
            </div>
            <button class="cancel-btn" on:click={handleCancel}>✕</button>
        {/if}
    </div>
</div>

<style>
    /* CSS Variables for precise theming */
    .dock-container {
        --glass-bg: rgba(18, 18, 24, 0.75);
        --glass-border: rgba(255, 255, 255, 0.08);
        --accent-cyan: #00e5ff;
        --accent-emerald: #00ff66;
        --accent-red: #ff3366;
        --text-main: #ffffff;
        --text-muted: rgba(255, 255, 255, 0.5);
        --font-ui: "Cabinet Grotesk", system-ui, sans-serif;

        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%);
        width: 360px;
        background: var(--glass-bg);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid var(--glass-border);
        border-radius: 28px;
        padding: 20px;
        box-shadow:
            0 24px 48px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        font-family: var(--font-ui);
        color: var(--text-main);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 20px;
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
    }

    .dock-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: var(--text-muted);
        padding: 0 4px;
    }

    .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent-red);
        box-shadow: 0 0 8px var(--accent-red);
        transition: all 0.3s ease;
    }

    .status-indicator.solved {
        background: var(--accent-emerald);
        box-shadow: 0 0 8px var(--accent-emerald);
    }

    .sync-btn {
        margin-left: auto;
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 14px;
        transition:
            color 0.2s,
            transform 0.2s;
    }

    .sync-btn:hover {
        color: var(--text-main);
        transform: rotate(180deg);
    }

    /* Segmented Control */
    .segmented-control {
        display: flex;
        background: rgba(0, 0, 0, 0.4);
        border-radius: 12px;
        padding: 4px;
        position: relative;
    }

    .segmented-control.disabled {
        opacity: 0.5;
        pointer-events: none;
    }

    .segmented-control button {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--text-muted);
        padding: 8px 0;
        font-family: inherit;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        border-radius: 8px;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .segmented-control button.active {
        background: rgba(255, 255, 255, 0.12);
        color: var(--text-main);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    /* Action Row */
    .action-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 40px;
        gap: 8px;
    }

    .primary-btn {
        flex: 1;
        height: 100%;
        border-radius: 10px;
        border: none;
        font-family: inherit;
        font-weight: 700;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .primary-btn:not(.outline):not(.warning):not(.success) {
        background: var(--text-main);
        color: #000;
    }

    .primary-btn.outline {
        background: transparent;
        border: 1px solid var(--glass-border);
        color: var(--text-main);
    }

    .primary-btn.outline:hover {
        background: rgba(255, 255, 255, 0.05);
    }

    .primary-btn.warning {
        background: var(--accent-red);
        color: #000;
    }

    .primary-btn.success {
        background: var(--accent-emerald);
        color: #000;
        box-shadow: 0 0 12px rgba(0, 255, 102, 0.3);
    }

    .cancel-btn {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--glass-border);
        color: var(--text-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .cancel-btn:hover {
        background: rgba(255, 51, 102, 0.2);
        color: var(--accent-red);
        border-color: rgba(255, 51, 102, 0.5);
    }

    .instruction-text {
        flex: 1;
        font-size: 13px;
        color: var(--text-muted);
        text-align: center;
        animation: pulse 2s infinite ease-in-out;
    }

    .instruction-text.cyan {
        color: var(--accent-cyan);
        text-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 0.7;
        }
        50% {
            opacity: 1;
        }
    }
</style>
