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

/**
 * Deep Solver: Partition edges into maximum possible number of disjoint cycles.
 * Minimum Swaps = Total Incorrect Cells - Maximum Disjoint Cycles
 */
export function calculateFullBoardOptimalSwaps(targetIds: string[]): SwapAction[] {
    const state = get(boardStore);
    if (state.isSolved || state.cells.size === 0) return [];

    const availablePool = new Map<string, { current: string, target: string }>();
    for (const cell of get(incorrectCellsStore)) {
        availablePool.set(cell.id, { current: cell.currentVal, target: cell.targetVal });
    }

    const remainingTargets = targetIds.filter(id => availablePool.has(id));
    if (remainingTargets.length === 0) return [];

    // Group edges by their transition: "FROM_LETTER -> TO_LETTER"
    // transitions["A"]["B"] = ["cell_id_1", "cell_id_2"]
    const transitions: Record<string, Record<string, string[]>> = {};
    for (const id of remainingTargets) {
        const node = availablePool.get(id)!;
        if (!transitions[node.current]) transitions[node.current] = {};
        if (!transitions[node.current][node.target]) transitions[node.current][node.target] = [];
        transitions[node.current][node.target].push(id);
    }

    let bestCycles: string[][] = [];

    /**
     * Recursive search for maximum cycle packing.
     */
    function findBestDecomposition(currentTransitions: typeof transitions, currentCycles: string[][]) {
        // Find first available transition
        let fromStr: string | null = null;
        for (const f in currentTransitions) {
            for (const t in currentTransitions[f]) {
                if (currentTransitions[f][t].length > 0) {
                    fromStr = f;
                    break;
                }
            }
            if (fromStr) break;
        }

        if (!fromStr) {
            if (currentCycles.length > bestCycles.length) {
                bestCycles = JSON.parse(JSON.stringify(currentCycles));
            }
            return;
        }

        // Branching: Every cycle starting with an edge from 'fromStr'
        // To keep it efficient, we only explore simple cycles starting from this specific edge.
        const workFrom = fromStr;
        const targetLetter = Object.keys(currentTransitions[workFrom]).find(t => currentTransitions[workFrom][t].length > 0)!;
        const edgeId = currentTransitions[workFrom][targetLetter].pop()!;

        const findCyclesFrom = (curr: string, path: string[], ids: string[]) => {
            if (curr === workFrom) {
                // Found a cycle! Recurse on remaining graph.
                findBestDecomposition(currentTransitions, [...currentCycles, [...ids]]);
                return;
            }

            if (path.includes(curr)) return; // Simple cycles only for branching

            const nextTargets = currentTransitions[curr] || {};
            for (const nextT in nextTargets) {
                if (nextTargets[nextT].length > 0) {
                    const nextId = nextTargets[nextT].pop()!;
                    findCyclesFrom(nextT, [...path, curr], [...ids, nextId]);
                    nextTargets[nextT].push(nextId); // Backtrack
                }
            }
        };

        findCyclesFrom(targetLetter, [], [edgeId]);
        currentTransitions[workFrom][targetLetter].push(edgeId); // Backtrack
    }

    // Optimization: Pre-extract all 2-cycles as they are always optimal to take
    const staticCycles: string[][] = [];
    const letters = Object.keys(transitions);
    for (let i = 0; i < letters.length; i++) {
        for (let j = i + 1; j < letters.length; j++) {
            const l1 = letters[i];
            const l2 = letters[j];
            while (transitions[l1]?.[l2]?.length > 0 && transitions[l2]?.[l1]?.length > 0) {
                staticCycles.push([transitions[l1][l2].pop()!, transitions[l2][l1].pop()!]);
            }
        }
    }

    findBestDecomposition(transitions, staticCycles);

    // 3. Convert cycles into SwapAction sequence
    const sequence: SwapAction[] = [];
    let stepCount = 1;

    for (const cycleIds of bestCycles) {
        // A cycle of N nodes [A, B, C] where A has B's letter, B has C's, C has A's
        // Resolving this takes N-1 swaps.
        // Swap(A, B): A resolved, B has A's letter (needs C's).
        // Swap(B, C): B resolved, C resolved.
        for (let i = 0; i < cycleIds.length - 1; i++) {
            const idA = cycleIds[i];
            const idB = cycleIds[i + 1];
            
            const nodeA = availablePool.get(idA)!;
            const nodeB = availablePool.get(idB)!;

            sequence.push({
                step: stepCount++,
                cellA_Id: idA,
                cellB_Id: idB,
                letterA: nodeA.current,
                letterB: nodeB.current,
                resolvesA: nodeB.current === nodeA.target,
                resolvesB: nodeA.current === nodeB.target
            });

            // Update simulation pool
            const temp = nodeA.current;
            nodeA.current = nodeB.current;
            nodeB.current = temp;
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
    return calculateFullBoardOptimalSwaps(allIds);
}
