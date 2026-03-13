<script lang="ts">
    import CommandDock from "./CommandDock.svelte";
    import OverlayManager from "./OverlayManager.svelte";
    import { onMount, onDestroy } from "svelte";
    import { initObserver, teardownObserver } from "../core/boardState";

    onMount(() => {
        initObserver();
    });

    onDestroy(() => {
        teardownObserver();
    });
</script>

<OverlayManager />
<CommandDock />
