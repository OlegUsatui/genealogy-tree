import { Injectable, computed, signal } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class LoadingOverlayService {
  private readonly activeKeys = signal<Set<string>>(new Set());

  readonly active = computed(() => this.activeKeys().size > 0);

  show(key: string): void {
    this.activeKeys.update((current) => {
      if (current.has(key)) {
        return current;
      }

      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  hide(key: string): void {
    this.activeKeys.update((current) => {
      if (!current.has(key)) {
        return current;
      }

      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }
}
