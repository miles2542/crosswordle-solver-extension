import { writable, derived } from 'svelte/store';

// --- Type Definitions ---
export type CellStatus = 'correct' | 'present' | 'incorrect' | 'empty';

export interface GridCell {
    id: string;          // Extracted from DOM, e.g., "0_0"
    r: number;
    c: number;
    currentVal: string;  // What is currently in the box
    targetVal: string;   // The actual answer (from data-answer)
    status: CellStatus;
    domNode: HTMLElement;
}

export interface BoardState {
    cells: Map<string, GridCell>;
    dimensions: { rows: number; cols: number };
    isSolved: boolean;
}

// --- Reactive Stores ---
// The master state of the board. UI components will subscribe to this.
export const boardStore = writable<BoardState>({
    cells: new Map(),
    dimensions: { rows: 0, cols: 0 },
    isSolved: false
});

// A derived store that just returns cells that are currently wrong.
// This is fed directly into Chunk 2 (The Swap Engine).
export const incorrectCellsStore = derived(boardStore, ($board) => {
    return Array.from($board.cells.values()).filter(c => c.status !== 'correct' && c.status !== 'empty');
});

// --- Core Logic ---

/**
 * Parses a single DOM node into our strict GridCell interface.
 */
function parseCell(node: HTMLElement): GridCell | null {
    const id = node.id;
    if (!id || !id.includes('_')) return null;

    const [rStr, cStr] = id.split('_');
    const targetVal = node.getAttribute('data-answer');

    // Some slots are empty/blockers in the crossword
    if (!targetVal) {
        return {
            id, r: parseInt(rStr), c: parseInt(cStr),
            currentVal: '', targetVal: '', status: 'empty', domNode: node
        };
    }

    // Crosswordle uses standard innerText, but click interaction might inject a cursor span.
    // We only want the text content of the direct text nodes.
    const currentVal = Array.from(node.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim())
        .join('')
        .toUpperCase();

    // Determine status purely from DOM classes to stay in sync with their engine
    let status: CellStatus = 'incorrect';
    if (node.classList.contains('correct')) status = 'correct';
    else if (node.classList.contains('present')) status = 'present';

    return {
        id,
        r: parseInt(rStr),
        c: parseInt(cStr),
        currentVal,
        targetVal,
        status,
        domNode: node
    };
}

/**
 * Scrapes the entire board and updates the Svelte store.
 */
export function forceSyncBoard() {
    const gridContainer = document.getElementById('grid');
    if (!gridContainer) {
        console.warn('Crosswordle Solver: Grid not found in DOM.');
        return;
    }

    const cellNodes = Array.from(gridContainer.querySelectorAll('.slot')) as HTMLElement[];
    const newCells = new Map<string, GridCell>();
    let maxR = 0;
    let maxC = 0;
    let allCorrect = true;

    for (const node of cellNodes) {
        const cell = parseCell(node);
        if (cell) {
            newCells.set(cell.id, cell);
            if (cell.r > maxR) maxR = cell.r;
            if (cell.c > maxC) maxC = cell.c;
            if (cell.status !== 'correct' && cell.status !== 'empty') {
                allCorrect = false;
            }
        }
    }

    boardStore.set({
        cells: newCells,
        dimensions: { rows: maxR + 1, cols: maxC + 1 },
        isSolved: allCorrect && newCells.size > 0
    });
}

// --- Mutation Observer (Auto-Sync) ---

let observer: MutationObserver | null = null;

/**
 * Initializes the observer to watch for user swaps.
 * Crosswordle updates classes (correct/present) and innerText on swap.
 */
export function initObserver() {
    if (observer) return;

    // We watch the entire body for structural changes because the #grid
    // can be destroyed and recreated by the game engine (e.g. on new levels or resets).
    const targetNode = document.body;

    // Initial scrape (if grid exists)
    forceSyncBoard();

    observer = new MutationObserver((mutations) => {
        let shouldSync = false;
        for (const mutation of mutations) {
            // Check if #grid was added or if children inside #grid changed
            if (mutation.type === 'childList') {
                const addedGrid = Array.from(mutation.addedNodes).some(n => (n as HTMLElement).id === 'grid' || (n as HTMLElement).querySelector?.('#grid'));
                if (addedGrid) {
                    shouldSync = true;
                    break;
                }
            }
            
            // Standard swap detection (classes or text)
            if (mutation.type === 'characterData' || mutation.type === 'attributes') {
                // Efficiency check: only sync if the target is inside #grid
                const target = mutation.target as HTMLElement;
                if (target.closest?.('#grid') || target.parentElement?.closest?.('#grid')) {
                    shouldSync = true;
                    break;
                }
            }
        }

        if (shouldSync) {
            requestAnimationFrame(() => forceSyncBoard());
        }
    });

    observer.observe(targetNode, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: true,
        characterData: true,
        childList: true
    });

    console.log('Crosswordle Solver: Tactile Hooks Engaged (Robust Mode).');
}

export function teardownObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}
