<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { spring } from "svelte/motion";
    import { scale } from "svelte/transition";
    import { boardStore, incorrectCellsStore } from "../core/boardState";
    import {
        getSequenceForCell,
        getSequenceForRow,
        getSequenceForCol,
        getSequenceForFullBoard,
        type SwapAction,
    } from "../core/swapEngine";

    let mode = $state<"cell" | "rowcol" | "full" | null>(null);
    let phase = $state<"idle" | "selecting" | "revealing" | "error">("idle");
    let currentSequence = $state<SwapAction[]>([]);
    let currentSwapIndex = $state(0);
    let targetSelection = $state<any>(null); // Can be string (cellId) or object {index, axis}
    let errorMessage = $state("");

    // Spring physics for smooth UI pop-ins
    const cardScale = spring(0, { stiffness: 0.1, damping: 0.4 });

    let cellRects = $state(new Map<string, DOMRect>());

    function updateRects() {
        for (const cell of $boardStore.cells.values()) {
            cellRects.set(cell.id, cell.domNode.getBoundingClientRect());
        }
    }

    // --- Event Listeners ---

    const handleActivate = (e: Event) => {
        mode = (e as CustomEvent).detail.mode;
        phase = "selecting";
        updateRects();
    };

    const handleClear = () => {
        phase = "idle";
        mode = null;
        currentSequence = [];
        currentSwapIndex = 0;
        cardScale.set(0);
    };

    const handleReveal = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        phase = "revealing";
        mode = detail.mode; // Fix: Crucial for Full Board mode overlays
        if (detail.mode === "rowcol") {
            targetSelection = {
                index: detail.target,
                axis: detail.axis || "row",
            };
        } else {
            targetSelection = detail.target;
        }
        updateRects();
        cardScale.set(1);

        if (detail.mode === "full") {
            currentSequence = getSequenceForFullBoard();
        } else if (detail.mode === "cell") {
            currentSequence = getSequenceForCell(detail.target as string);
        } else if (detail.mode === "rowcol") {
            const axis = detail.axis || "row";
            if (axis === "row") {
                currentSequence = getSequenceForRow(detail.target as number);
            } else {
                currentSequence = getSequenceForCol(detail.target as number);
            }
        }
    };

    onMount(() => {
        window.addEventListener("cw-activate-selection", handleActivate);
        window.addEventListener("cw-clear-overlays", handleClear);
        window.addEventListener("cw-start-reveal", handleReveal);
        window.addEventListener("resize", updateRects);
    });

    onDestroy(() => {
        window.removeEventListener("cw-activate-selection", handleActivate);
        window.removeEventListener("cw-clear-overlays", handleClear);
        window.removeEventListener("cw-start-reveal", handleReveal);
        window.removeEventListener("resize", updateRects);
    });

    // --- SVG Math ---

    function getCellCenter(id: string) {
        const rect = cellRects.get(id);
        if (!rect) return { x: 0, y: 0 };
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        };
    }

    function generateBezier(idA: string, idB: string) {
        const p1 = getCellCenter(idA);
        const p2 = getCellCenter(idB);
        // Calculate control point for dynamic curve based on distance
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const cx = p1.x + dx * 0.5 - dy * 0.2; // Offset for curve
        const cy = p1.y + dy * 0.5 + dx * 0.2;

        return `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`;
    }

    let activeSwap = $derived(currentSequence[currentSwapIndex] || null);

    // --- Reactive Auto-Advance Logic (Svelte 5 Effect) ---
    let prevIncorrectHash = "";

    // Using $effect properly breaks the dependency cycle between currentSwapIndex and the reactive block
    $effect(() => {
        if ($boardStore && phase === "revealing") {
            const sequence = currentSequence;
            const index = currentSwapIndex;
            const currentActive = sequence[index];

            if (currentActive) {
                const currentCells = $boardStore.cells;
                const cellA = currentCells.get(currentActive.cellA_Id);
                const cellB = currentCells.get(currentActive.cellB_Id);

                const currentIncorrect = $incorrectCellsStore;
                const newHash = currentIncorrect
                    .map((c) => `${c.id}:${c.currentVal}`)
                    .join("|");

                // Check if expected swap happened
                if (
                    cellA?.currentVal === currentActive.letterB &&
                    cellB?.currentVal === currentActive.letterA
                ) {
                    currentSwapIndex = index + 1;
                    prevIncorrectHash = newHash; // Suppress "Hey!" for the correct swap

                    if (currentSwapIndex >= sequence.length) {
                        // Sequence complete - unify auto-exit
                        setTimeout(() => {
                            window.dispatchEvent(
                                new CustomEvent("cw-clear-overlays"),
                            );
                        }, 800);
                    }
                } else if (prevIncorrectHash && newHash !== prevIncorrectHash) {
                    // Strict: Any change that isn't the expected swap triggers "Hey!"
                    const lA = cellA?.currentVal || "";
                    const lB = cellB?.currentVal || "";

                    if (lA !== "" && lB !== "") {
                        phase = "error";
                        errorMessage = "Hey!";
                    }
                }
                prevIncorrectHash = newHash;
            }
        } else if (phase !== "revealing" && phase !== "error") {
            prevIncorrectHash = "";
        }
    });

    let visibleCells = $derived(
        $incorrectCellsStore.filter((cell) => {
            if (mode === "full") return true;
            if (mode === "cell") return cell.id === targetSelection;
            if (mode === "rowcol") {
                const index =
                    typeof targetSelection === "object"
                        ? targetSelection.index
                        : targetSelection;
                const axis =
                    typeof targetSelection === "object"
                        ? targetSelection.axis
                        : "row";

                if (typeof index === "number") {
                    return axis === "row" ? cell.r === index : cell.c === index;
                }
            }
            return false;
        }),
    );

    // Fix for targetSelection type in rowcol event
    onMount(() => {
        const selectionHandler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (mode === "rowcol") {
                targetSelection = { index: detail.target, axis: detail.axis };
            } else {
                targetSelection = detail.target;
            }
        };
        window.addEventListener("cw-selection-made", selectionHandler);
        return () =>
            window.removeEventListener("cw-selection-made", selectionHandler);
    });
</script>

<div class="overlay-container" class:error-state={phase === "error"}>
    {#if phase === "error"}
        <div class="error-notification" in:scale>
            {errorMessage}
            <button onclick={handleClear}>Clear</button>
        </div>
    {/if}

    {#if phase === "revealing" && activeSwap}
        <svg class="routing-svg">
            <defs>
                <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="var(--accent-cyan)"
                        fill-opacity="0.6"
                    />
                </marker>
            </defs>
            <path
                d={generateBezier(activeSwap.cellA_Id, activeSwap.cellB_Id)}
                class="route-line"
                marker-end="url(#arrowhead)"
            />
        </svg>
    {/if}

    {#if phase === "revealing"}
        {#each visibleCells as cell (cell.id)}
            {@const rect = cellRects.get(cell.id)}
            {@const isActive =
                activeSwap &&
                (cell.id === activeSwap.cellA_Id ||
                    cell.id === activeSwap.cellB_Id)}
            {#if rect}
                <div
                    class="data-card"
                    class:active={isActive}
                    style="left: {rect.right}px; top: {rect.top}px; transform: translate(-20%, -80%) scale({$cardScale *
                        (isActive ? 1.0 : 0.75)});"
                >
                    <div class="card-inner">
                        <span class="label">Target</span>
                        <span class="value">{cell.targetVal}</span>
                    </div>
                </div>
            {/if}
        {/each}
    {/if}

    {#if phase === "selecting"}
        {#each Array.from($boardStore.cells.values()) as cell}
            {@const rect = cellRects.get(cell.id)}
            {#if rect && cell.status !== "empty"}
                <button
                    class="slot-overlay"
                    aria-label="Select cell {cell.id}"
                    style="left: {rect.left}px; top: {rect.top}px; width: {rect.width}px; height: {rect.height}px;"
                    onmouseenter={() => {
                        if (mode === "cell") {
                            window.dispatchEvent(
                                new CustomEvent("cw-cell-hover", {
                                    detail: { id: cell.id },
                                }),
                            );
                        }
                    }}
                    onclick={() => {
                        if (mode === "cell") {
                            window.dispatchEvent(
                                new CustomEvent("cw-selection-made", {
                                    detail: { target: cell.id },
                                }),
                            );
                        }
                    }}
                >
                    <div class="hover-glow"></div>
                </button>
            {/if}
        {/each}

        {#if mode === "rowcol"}
            {#each Array.from({ length: $boardStore.dimensions.rows }) as _, r}
                {@const firstCell = $boardStore.cells.get(`${r}_0`)}
                {#if firstCell}
                    {@const rect = cellRects.get(firstCell.id)}
                    {#if rect}
                        <button
                            class="gutter-tab row"
                            aria-label="Select row {r + 1}"
                            style="left: {rect.left - 48}px; top: {rect.top +
                                rect.height / 2}px;"
                            onclick={() => {
                                window.dispatchEvent(
                                    new CustomEvent("cw-selection-made", {
                                        detail: { target: r, axis: "row" },
                                    }),
                                );
                            }}
                        >
                            ▶
                        </button>
                    {/if}
                {/if}
            {/each}

            {#each Array.from({ length: $boardStore.dimensions.cols }) as _, c}
                {@const firstCell = $boardStore.cells.get(`0_${c}`)}
                {#if firstCell}
                    {@const rect = cellRects.get(firstCell.id)}
                    {#if rect}
                        <button
                            class="gutter-tab col"
                            aria-label="Select column {c + 1}"
                            style="left: {rect.left +
                                rect.width / 2}px; top: {rect.top - 48}px;"
                            onclick={() => {
                                window.dispatchEvent(
                                    new CustomEvent("cw-selection-made", {
                                        detail: { target: c, axis: "col" },
                                    }),
                                );
                            }}
                        >
                            ▼
                        </button>
                    {/if}
                {/if}
            {/each}
        {/if}
    {/if}
</div>

<style>
    .overlay-container {
        --glass-bg: rgba(18, 18, 24, 0.75);
        --glass-border: rgba(255, 255, 255, 0.08);
        --accent-cyan: #00e5ff;
        --accent-emerald: #00ff66;
        --accent-red: #ff3366;
        --text-main: #ffffff;
        --text-muted: rgba(255, 255, 255, 0.5);
        --font-ui: "Cabinet Grotesk", system-ui, sans-serif;

        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 50;
    }

    .routing-svg {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        overflow: visible;
    }

    .route-line {
        fill: none;
        stroke: var(--accent-cyan);
        stroke-width: 4px;
        stroke-dasharray: 8 8;
        animation: march 1s linear infinite;
        filter: drop-shadow(0 0 6px var(--accent-cyan));
    }

    @keyframes march {
        to {
            stroke-dashoffset: -16;
        }
    }

    .slot-overlay {
        position: absolute;
        background: transparent;
        border: none;
        cursor: pointer;
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
    }

    .hover-glow {
        width: 80%;
        height: 80%;
        border-radius: 12px;
        background: var(--accent-cyan);
        opacity: 0;
        filter: blur(12px);
        transition: opacity 0.2s;
    }

    .slot-overlay:hover .hover-glow {
        opacity: 0.3;
    }

    .gutter-tab {
        position: absolute;
        width: 32px;
        height: 32px;
        background: var(--glass-bg);
        backdrop-filter: blur(8px);
        border: 1px solid var(--glass-border);
        border-radius: 50%;
        color: var(--text-main);
        cursor: pointer;
        pointer-events: auto;
        display: flex;
        justify-content: center;
        align-items: center;
        transform: translate(-50%, -50%);
        transition: all 0.2s;
        z-index: 100;
    }

    .gutter-tab:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translate(-50%, -50%) scale(1.2);
        box-shadow: 0 0 15px var(--accent-cyan);
        border-color: var(--accent-cyan);
    }

    .data-card {
        position: absolute;
        background: var(--glass-bg);
        backdrop-filter: blur(12px);
        border: 1px solid var(--glass-border);
        border-radius: 8px;
        padding: 4px 8px;
        display: flex;
        gap: 8px;
        align-items: center;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
        font-family: var(--font-ui);
        font-weight: bold;
        pointer-events: none;
        z-index: 100;
        white-space: nowrap;
        transform-origin: center bottom;
        transition:
            transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
            opacity 0.4s ease,
            box-shadow 0.4s ease,
            border-color 0.4s ease;
        opacity: 0.3;
    }

    .data-card.active {
        opacity: 1;
        border-color: var(--accent-cyan);
        box-shadow:
            0 0 20px rgba(0, 229, 255, 0.5),
            0 8px 16px rgba(0, 0, 0, 0.5);
        z-index: 101;
    }

    .card-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 24px;
    }

    .label {
        font-size: 9px;
        text-transform: uppercase;
        color: var(--text-muted);
        letter-spacing: 0.5px;
    }

    .value {
        font-size: 16px;
        color: var(--accent-emerald);
    }

    .error-notification {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--accent-red);
        color: #000;
        padding: 32px 64px;
        border-radius: 28px;
        font-size: 56px;
        font-weight: 900;
        box-shadow: 0 0 80px rgba(255, 51, 102, 0.6);
        z-index: 2000000; /* Higher than dock */
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        pointer-events: auto;
    }

    .error-notification button {
        background: #000;
        color: #fff;
        border: none;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
        font-weight: bold;
    }
</style>
