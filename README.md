# Crosswordle Solver

A lightweight, high-precision browser extension designed to solve Crosswordle puzzles with optimal efficiency. This project started as a personal deep dive into DOM manipulation, reverse-engineering web game states, and implementing cycle decomposition algorithms for minimal-move solutions.

It doesn't just find the answer; it routes the exact sequence of swaps required to guarantee a perfect 6-star finish every time.

## Overview

Crosswordle Solver overlays a tactile interface directly onto the game board, guiding you through the necessary letter swaps. It features:

- **Target Reveal**: Instant identification of correct letters for any cell.
- **Path Optimization**: A custom engine that decomposes the board state into disjoint cycles to minimize the total number of swaps.
- **Tactile UI**: High-quality overlays with smooth motion and focused data cards to make execution effortless.

## Installation

### Firefox
Available on the official Add-ons store:
[Download for Firefox](https://addons.mozilla.org/en-US/firefox/addon/crosswordle/)

### Microsoft Edge
*Currently in review.* A link to the Edge Add-ons store will be provided here once the listing is live.

### Google Chrome (Manual Install)
Until the extension is listed on the Chrome Web Store, you can install it manually:

1. Download the latest `dist.zip` from the releases.
2. Unzip the contents to a local folder.
3. Open `chrome://extensions/` in your browser.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the folder where you unzipped the files.

## How It Works

The solver operates in three distinct phases to bridge the gap between the static DOM and a dynamic solution:

### 1. State Scraping
The extension uses a `MutationObserver` to stay in sync with the board. It scrapes the current letter values and the expected target values (extracted from `data-answer` attributes) to build a reactive internal map of the game state.

### 2. Cycle Decomposition
Finding the minimum number of swaps is a classic permutation problem. For "Full Board" mode, the engine:
- Maps the transition of every incorrect letter to its target position.
- Partitions these transitions into the maximum number of disjoint cycles.
- Resolves each cycle of length $N$ using $N-1$ swaps, ensuring the absolute minimum move count.

### 3. Reactive UI Overlay
Built with Svelte 5, the UI uses a custom SVG routing layer to draw bezier-curved paths between swap pairs. The "Focused Reveal" mode dims peripheral cells and highlights the active pair with tactile animations, ensuring you never lose your place during complex sequences.

## Development

This extension is built with:
- **Svelte 5**: For the reactive UI layer and state management.
- **Vite**: For blazing-fast bundling and HMR.
- **TypeScript**: Ensuring robustness across the solver logic and DOM interactions.

Created by Miles as a side project to explore extension development and algorithmic optimization.
