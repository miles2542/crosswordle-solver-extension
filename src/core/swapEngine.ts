import { get } from 'svelte/store';
import { boardStore, incorrectCellsStore } from './boardState';

export interface SwapAction {
    step: number;
    cellA_Id: string;
    cellB_Id: string;
    letterA: string;
    letterB: string;
    resolvesA: boolean;
    resolvesB: boolean;
}

/**
 * Core Algorithm: Calculates the optimal sequence of swaps to solve a target set of cells.
 * * @param targetIds The IDs of the cells we WANT to solve (e.g., a specific row, or full board)
 * @returns Array of sequential SwapActions.
 */
export function calculateOptimalSwaps(targetIds: string[]): SwapAction[] {
    const state = get(boardStore);
    if (state.isSolved || state.cells.size === 0) return [];

    // Create a deep-ish clone of ONLY the incorrect cells to simulate swaps without touching the DOM
    const availablePool = new Map<string, { current: string, target: string }>();

    for (const cell of get(incorrectCellsStore)) {
        availablePool.set(cell.id, { current: cell.currentVal, target: cell.targetVal });
    }

    // Filter targets to only those that are actually incorrect
    const remainingTargets = new Set(targetIds.filter(id => availablePool.has(id)));
    const sequence: SwapAction[] = [];
    let stepCount = 1;

    // Helper to apply a swap in our simulation matrix
    const simulateSwap = (idA: string, idB: string): SwapAction => {
        const nodeA = availablePool.get(idA)!;
        const nodeB = availablePool.get(idB)!;

        const action: SwapAction = {
            step: stepCount++,
            cellA_Id: idA,
            cellB_Id: idB,
            letterA: nodeA.current,
            letterB: nodeB.current,
            resolvesA: nodeB.current === nodeA.target,
            resolvesB: nodeA.current === nodeB.target
        };

        // Perform the swap in memory
        const temp = nodeA.current;
        nodeA.current = nodeB.current;
        nodeB.current = temp;

        // If either is now correct, remove them from the target pool
        if (action.resolvesA) remainingTargets.delete(idA);
        if (action.resolvesB) remainingTargets.delete(idB);

        // If they are correct, remove them from the available pool so they aren't used again
        if (nodeA.current === nodeA.target) availablePool.delete(idA);
        if (nodeB.current === nodeB.target) availablePool.delete(idB);

        return action;
    };

    // The Greedy Resolution Loop
    while (remainingTargets.size > 0) {
        const targetId = Array.from(remainingTargets)[0];
        const targetNode = availablePool.get(targetId)!;

        // Phase 1: Search for a Perfect 2-Cycle (A needs B's letter, B needs A's letter)
        let foundPerfectSwap = false;
        for (const [poolId, poolNode] of availablePool.entries()) {
            if (poolId !== targetId && poolNode.current === targetNode.target && poolNode.target === targetNode.current) {
                sequence.push(simulateSwap(targetId, poolId));
                foundPerfectSwap = true;
                break;
            }
        }

        if (foundPerfectSwap) continue;

        // Phase 2: Fallback to Chain Resolution (Find ANY cell that holds the letter we need)
        // Optimization: Pick a cell that needs the letter we are displacing, if possible.
        let bestCandidateId: string | null = null;

        for (const [poolId, poolNode] of availablePool.entries()) {
            if (poolId !== targetId && poolNode.current === targetNode.target) {
                bestCandidateId = poolId;
                // If this candidate also belongs to our target group, prioritize it to solve the group faster
                if (remainingTargets.has(poolId)) break;
            }
        }

        if (bestCandidateId) {
            sequence.push(simulateSwap(targetId, bestCandidateId));
        } else {
            console.error(`Solver Error: Matrix unresolvable. Cannot find letter ${targetNode.target} for cell ${targetId}.`);
            break; // Failsafe to prevent infinite loops if DOM scrape was corrupted
        }
    }

    return sequence;
}

// --- Mode Wrappers for the UI ---

export function getSequenceForCell(cellId: string): SwapAction[] {
    return calculateOptimalSwaps([cellId]);
}

export function getSequenceForRow(rowIndex: number): SwapAction[] {
    const state = get(boardStore);
    const rowCellIds = Array.from(state.cells.values())
        .filter(c => c.r === rowIndex)
        .map(c => c.id);
    return calculateOptimalSwaps(rowCellIds);
}

export function getSequenceForCol(colIndex: number): SwapAction[] {
    const state = get(boardStore);
    const colCellIds = Array.from(state.cells.values())
        .filter(c => c.c === colIndex)
        .map(c => c.id);
    return calculateOptimalSwaps(colCellIds);
}

export function getSequenceForFullBoard(): SwapAction[] {
    const state = get(boardStore);
    const allIds = Array.from(state.cells.keys());
    return calculateOptimalSwaps(allIds);
}
