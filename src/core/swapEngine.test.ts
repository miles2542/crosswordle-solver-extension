import { describe, it, expect, vi } from 'vitest';
import { calculateOptimalSwaps, calculateFullBoardOptimalSwaps } from './swapEngine';
import * as boardState from './boardState';

// Mock boardState
vi.mock('./boardState', () => ({
    boardStore: {
        subscribe: vi.fn(),
    },
    incorrectCellsStore: {
        subscribe: vi.fn(),
    }
}));

// Mock Svelte's get
vi.mock('svelte/store', () => ({
    get: vi.fn((store) => {
        if (store === boardState.boardStore) return mockBoardState;
        if (store === boardState.incorrectCellsStore) return mockIncorrectCells;
        return null;
    })
}));

let mockBoardState = { isSolved: false, cells: new Map() };
let mockIncorrectCells: any[] = [];

describe('Swap Engine Baseline', () => {
    it('should return empty sequence for solved board', () => {
        mockBoardState = { isSolved: true, cells: new Map() };
        mockIncorrectCells = [];
        expect(calculateOptimalSwaps([])).toEqual([]);
    });

    it('should find a 2-cycle (optimal)', () => {
        // A wants 'B' (has 'A'), B wants 'A' (has 'B')
        mockBoardState = { 
            isSolved: false, 
            cells: new Map([
                ['A', { id: 'A', currentVal: 'A', targetVal: 'B' }],
                ['B', { id: 'B', currentVal: 'B', targetVal: 'A' }]
            ]) 
        } as any;
        mockIncorrectCells = [
            { id: 'A', currentVal: 'A', targetVal: 'B' },
            { id: 'B', currentVal: 'B', targetVal: 'A' }
        ];

        const sequence = calculateOptimalSwaps(['A', 'B']);
        expect(sequence).toHaveLength(1);
        expect(sequence[0].cellA_Id).toBe('A');
        expect(sequence[0].cellB_Id).toBe('B');
        expect(sequence[0].resolvesA).toBe(true);
        expect(sequence[0].resolvesB).toBe(true);
    });

    it('should handle a 3-cycle in 2 swaps', () => {
        // A needs B, B needs C, C needs A
        mockBoardState = { 
            isSolved: false, 
            cells: new Map([
                ['A', { id: 'A', currentVal: 'A', targetVal: 'B' }],
                ['B', { id: 'B', currentVal: 'B', targetVal: 'C' }],
                ['C', { id: 'C', currentVal: 'C', targetVal: 'A' }]
            ]) 
        } as any;
        mockIncorrectCells = [
            { id: 'A', currentVal: 'A', targetVal: 'B' },
            { id: 'B', currentVal: 'B', targetVal: 'C' },
            { id: 'C', currentVal: 'C', targetVal: 'A' }
        ];

        const sequence = calculateOptimalSwaps(['A', 'B', 'C']);
        expect(sequence).toHaveLength(2);
    });

    it('should demonstrate sub-optimality of greedy approach for duplicates (Cycle Merger)', () => {
        /**
         * Setup for sub-optimality (Cycle Merger):
         * Cycle 1: A(1->E), C(E->3), E(3->1)  [Needs 2 swaps]
         * Cycle 2: B(2->E), D(E->4), F(4->2)  [Needs 2 swaps]
         * Total Optimal: 4 swaps.
         * 
         * Greedy Phase 2 for A:
         * A needs 'E'. Both C and D have 'E'.
         * If it picks D (wrong one), it merges into one giant cycle of 6 nodes.
         * Giant cycle: A(E), D(1->4), F(4->2), B(2->E), C(E->3), E(3->1)
         * Total Greedy: (A,D) + (D,F) + (F,B) + (B,C) + (C,E) = 5 swaps.
         */
        mockBoardState = { 
            isSolved: false, 
            cells: new Map([
                ['A', { id: 'A', currentVal: '1', targetVal: 'E' }],
                ['B', { id: 'B', currentVal: '2', targetVal: 'E' }],
                ['C', { id: 'C', currentVal: 'E', targetVal: '3' }],
                ['D', { id: 'D', currentVal: 'E', targetVal: '4' }],
                ['E', { id: 'E', currentVal: '3', targetVal: '1' }],
                ['F', { id: 'F', currentVal: '4', targetVal: '2' }]
            ]) 
        } as any;
        mockIncorrectCells = [
            { id: 'A', currentVal: '1', targetVal: 'E' },
            { id: 'B', currentVal: '2', targetVal: 'E' },
            { id: 'C', currentVal: 'E', targetVal: '3' },
            { id: 'D', currentVal: 'E', targetVal: '4' },
            { id: 'E', currentVal: '3', targetVal: '1' },
            { id: 'F', currentVal: '4', targetVal: '2' }
        ];

        const sequence = calculateOptimalSwaps(['A', 'B', 'C', 'D', 'E', 'F']);
        console.log('Greedy sequence length for Cycle Merger:', sequence.length);
        expect(sequence.length).toBeGreaterThanOrEqual(4);
    });

    it('should find TRUE optimal for Cycle Merger using full board solver', () => {
        mockBoardState = { 
            isSolved: false, 
            cells: new Map([
                ['A', { id: 'A', currentVal: '1', targetVal: 'E' }],
                ['B', { id: 'B', currentVal: '2', targetVal: 'E' }],
                ['C', { id: 'C', currentVal: 'E', targetVal: '3' }],
                ['D', { id: 'D', currentVal: 'E', targetVal: '4' }],
                ['E', { id: 'E', currentVal: '3', targetVal: '1' }],
                ['F', { id: 'F', currentVal: '4', targetVal: '2' }]
            ]) 
        } as any;
        mockIncorrectCells = [
            { id: 'A', currentVal: '1', targetVal: 'E' },
            { id: 'B', currentVal: '2', targetVal: 'E' },
            { id: 'C', currentVal: 'E', targetVal: '3' },
            { id: 'D', currentVal: 'E', targetVal: '4' },
            { id: 'E', currentVal: '3', targetVal: '1' },
            { id: 'F', currentVal: '4', targetVal: '2' }
        ];

        const sequence = calculateFullBoardOptimalSwaps(['A', 'B', 'C', 'D', 'E', 'F']);
        console.log('Optimized sequence length for Cycle Merger:', sequence.length);
        
        // This MUST be 4.
        expect(sequence.length).toBe(4);
    });
});
