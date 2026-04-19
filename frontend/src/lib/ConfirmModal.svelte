<script lang="ts">
  let {
    open = false,
    title = "Confirm",
    message = "",
    confirmLabel = "Continue",
    cancelLabel = "Cancel",
    onConfirm,
    onCancel,
  }: {
    open?: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) onCancel();
  }

  function handleBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onCancel();
  }
</script>

{#if open}
  <div
    class="confirm-modal-backdrop"
    role="presentation"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={handleBackdropKeydown}
  >
    <div class="confirm-modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>
      <div class="confirm-modal-actions">
        <button type="button" class="btn-secondary" onclick={onCancel}>{cancelLabel}</button>
        <button type="button" class="btn-primary" onclick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirm-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(15 23 42 / 55%);
  }

  .confirm-modal-card {
    width: min(460px, 100%);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-surface);
    box-shadow: 0 18px 35px rgb(15 23 42 / 24%);
    padding: 16px;
  }

  .confirm-modal-card h2 {
    margin: 0 0 8px;
    font-size: 16px;
  }

  .confirm-modal-card p {
    margin: 0;
    color: var(--text-primary);
    line-height: 1.45;
  }

  .confirm-modal-actions {
    margin-top: 14px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
