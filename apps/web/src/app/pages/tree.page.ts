import type { Person, TreeResponse } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, ElementRef, ViewChild, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";

import { MATERIAL_IMPORTS } from "../material";
import { AuthService } from "../services/auth.service";
import { awaitOne } from "../services/await-one";
import { PersonsService } from "../services/persons.service";
import { TreeService } from "../services/tree.service";
import { buildTreeDiagram, type TreeDiagram, type TreeDiagramNode } from "./tree-diagram";

@Component({
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page page-stack">
      <mat-card class="diagram-card" *ngIf="diagram() as diagram; else emptyState">
        <mat-progress-bar *ngIf="isLoading()" mode="indeterminate"></mat-progress-bar>
        <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

        <div class="diagram-stage">
          <div
            #viewport
            class="diagram-scroll"
            [class.is-panning]="isPanning()"
            (wheel)="handleWheel($event)"
            (pointerdown)="startPan($event)"
            (pointermove)="movePan($event)"
            (pointerup)="endPan($event)"
            (pointercancel)="endPan($event)"
            (pointerleave)="endPan($event)"
          >
            <div
              class="diagram-canvas"
              [style.width.px]="canvasWidth(diagram)"
              [style.height.px]="canvasHeight(diagram)"
            >
              <svg
                class="tree-svg"
                [attr.viewBox]="diagram.viewBox"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="rgba(48, 93, 148, 0.18)"></feDropShadow>
                  </filter>
                </defs>

                <g *ngFor="let link of diagram.links">
                  <path
                    class="tree-link"
                    [class.branch-link]="link.kind === 'branch'"
                    [class.spouse-link]="link.kind === 'spouse'"
                    [attr.d]="link.path"
                  ></path>
                </g>

                <g
                  *ngFor="let node of diagram.nodes"
                  class="tree-node-group"
                  [class.root-node]="node.role === 'root'"
                  [class.ancestor-node]="node.role === 'ancestor'"
                  [class.descendant-node]="node.role === 'descendant'"
                  [class.spouse-node]="node.role === 'spouse'"
                  [attr.transform]="'translate(' + node.x + ',' + node.y + ')'"
                  (click)="focusPerson(node.person.id)"
                >
                  <rect
                    class="tree-node-card"
                    [attr.width]="node.width"
                    [attr.height]="node.height"
                    rx="24"
                    ry="24"
                  ></rect>

                  <text class="tree-node-badge" x="18" y="24">{{ nodeRoleLabel(node) }}</text>
                  <text class="tree-node-title" x="18" y="46">
                    <tspan *ngFor="let line of titleLines(node.person); let index = index" x="18" [attr.dy]="index === 0 ? 0 : 20">
                      {{ line }}
                    </tspan>
                  </text>
                  <text class="tree-node-meta" x="18" y="92">{{ labelBottom(node.person) }}</text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      </mat-card>

      <ng-template #emptyState>
        <mat-card class="diagram-card">
          <div class="empty-state">Немає достатньо даних для побудови дерева.</div>
        </mat-card>
      </ng-template>
    </section>
  `,
  styles: [
    `
      .page-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: min(1600px, calc(100vw - 12px));
        padding-top: 12px;
        padding-bottom: 16px;
      }

      .diagram-card {
        padding: 14px;
      }

      .diagram-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .diagram-stage {
        position: relative;
      }

      .diagram-scroll {
        position: relative;
        overflow: auto;
        border-radius: 22px;
        border: 1px solid var(--border);
        min-height: calc(100vh - 150px);
        cursor: grab;
        touch-action: none;
        user-select: none;
        isolation: isolate;
        background:
          radial-gradient(circle at 18% 18%, rgba(157, 201, 125, 0.16), transparent 18%),
          radial-gradient(circle at 82% 16%, rgba(190, 218, 150, 0.18), transparent 18%),
          linear-gradient(180deg, rgba(250, 252, 246, 0.98), rgba(238, 245, 235, 0.97) 58%, rgba(230, 238, 229, 0.97));
      }

      .diagram-scroll::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        opacity: 0.16;
        background-image: url("/decor-tree.svg");
        background-repeat: no-repeat;
        background-position: center center;
        background-size: auto calc(100% - 24px);
      }

      .diagram-scroll::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.26), transparent 20%, transparent 80%, rgba(206, 223, 199, 0.16)),
          radial-gradient(circle at center, transparent 40%, rgba(255, 255, 255, 0.24));
      }

      .diagram-scroll.is-panning {
        cursor: grabbing;
      }

      .diagram-canvas {
        position: relative;
        z-index: 1;
      }

      .tree-svg {
        display: block;
        width: 100%;
        height: 100%;
      }

      .tree-link {
        fill: none;
        stroke-linecap: round;
        stroke-width: 3;
      }

      .branch-link {
        stroke: rgba(60, 101, 154, 0.28);
      }

      .spouse-link {
        stroke: rgba(80, 130, 196, 0.24);
        stroke-dasharray: 10 8;
      }

      .tree-node-group {
        cursor: pointer;
      }

      .tree-node-card {
        stroke: rgba(66, 108, 161, 0.16);
        stroke-width: 1.5;
        filter: url(#nodeShadow);
        transition: transform 0.18s ease, stroke 0.18s ease;
      }

      .tree-node-group:hover .tree-node-card {
        stroke: rgba(31, 103, 198, 0.42);
      }

      .root-node .tree-node-card {
        fill: rgba(223, 236, 255, 0.98);
      }

      .ancestor-node .tree-node-card {
        fill: rgba(241, 247, 255, 0.98);
      }

      .descendant-node .tree-node-card {
        fill: rgba(234, 244, 255, 0.98);
      }

      .spouse-node .tree-node-card {
        fill: rgba(230, 240, 255, 0.98);
      }

      .tree-node-badge {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        fill: rgba(73, 111, 157, 0.72);
      }

      .tree-node-title {
        font-size: 18px;
        font-weight: 800;
        fill: #17324d;
      }

      .tree-node-meta {
        font-size: 13px;
        fill: rgba(86, 120, 162, 0.88);
      }

      @media (max-width: 720px) {
        .diagram-scroll {
          min-height: calc(100vh - 130px);
        }

        .diagram-scroll::before {
          background-size: auto calc(100% - 16px);
        }
      }
    `,
  ],
})
export class TreePageComponent {
  @ViewChild("viewport")
  private viewportRef?: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly treeService = inject(TreeService);
  private readonly personsService = inject(PersonsService);
  private readonly authService = inject(AuthService);

  readonly errorMessage = signal("");
  readonly isLoading = signal(false);
  readonly tree = signal<TreeResponse | null>(null);
  readonly diagram = signal<TreeDiagram | null>(null);
  readonly rootPersonId = signal<string | null>(null);
  readonly persons = signal<Person[]>([]);
  readonly isPanning = signal(false);
  readonly zoom = signal(1);
  readonly minZoom = 0.55;
  readonly maxZoom = 2.4;

  private panState: {
    pointerId: number;
    viewport: HTMLElement;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    moved: boolean;
  } | null = null;
  private suppressNodeClick = false;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const personId = params.get("personId");

      if (personId) {
        this.rootPersonId.set(personId);
        void this.loadTree(personId);
        return;
      }

      this.rootPersonId.set(null);

      const firstPersonId = this.getDefaultRootPersonId(this.persons());

      if (firstPersonId) {
        void this.loadTree(firstPersonId);
      }
    });

    void this.loadPersons();
  }

  displayName(person: Person): string {
    return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
  }

  titleLines(person: Person): string[] {
    return wrapNodeTitle(this.displayName(person));
  }

  canvasWidth(diagram: TreeDiagram): number {
    return Math.max(320, Math.round(diagram.width * this.zoom()));
  }

  canvasHeight(diagram: TreeDiagram): number {
    return Math.max(240, Math.round(diagram.height * this.zoom()));
  }

  labelBottom(person: Person): string {
    const labels = [person.birthDate, person.birthPlace, person.deathDate ? `† ${person.deathDate}` : null].filter(
      Boolean,
    );
    return truncate(labels.join(" • ") || "Дані не вказані", 34);
  }

  nodeRoleLabel(node: TreeDiagramNode): string {
    switch (node.role) {
      case "root":
        return "ЦЕНТР";
      case "ancestor":
        return "ПРЕДОК";
      case "descendant":
        return "НАЩАДОК";
      case "spouse":
        return "ПАРТНЕР";
    }
  }

  async focusPerson(personId: string): Promise<void> {
    if (this.suppressNodeClick) {
      return;
    }

    if (personId === this.rootPersonId()) {
      await this.loadTree(personId);
      return;
    }

    await this.router.navigate(["/tree", personId]);
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const viewport = event.currentTarget;

    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    const direction = event.deltaY > 0 ? -0.12 : 0.12;
    this.applyZoom(this.zoom() + direction, viewport, event.clientX, event.clientY);
  }

  startPan(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const viewport = event.currentTarget;

    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    this.panState = {
      pointerId: event.pointerId,
      viewport,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
    this.isPanning.set(true);
  }

  movePan(event: PointerEvent): void {
    if (!this.panState || event.pointerId !== this.panState.pointerId) {
      return;
    }

    const deltaX = event.clientX - this.panState.startX;
    const deltaY = event.clientY - this.panState.startY;

    this.panState.viewport.scrollLeft = this.panState.startScrollLeft - deltaX;
    this.panState.viewport.scrollTop = this.panState.startScrollTop - deltaY;
    this.panState.moved ||= Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;
  }

  endPan(event: PointerEvent): void {
    if (!this.panState || event.pointerId !== this.panState.pointerId) {
      return;
    }

    const { viewport, pointerId, moved } = this.panState;

    if (viewport.hasPointerCapture(pointerId)) {
      viewport.releasePointerCapture(pointerId);
    }

    this.panState = null;
    this.isPanning.set(false);

    if (moved) {
      this.suppressNodeClick = true;
      window.setTimeout(() => {
        this.suppressNodeClick = false;
      }, 0);
    }
  }

  private async loadPersons(): Promise<void> {
    try {
      const persons = (await awaitOne<Person[]>(this.personsService.list())).sort((left, right) =>
        this.displayName(left).localeCompare(this.displayName(right), "uk"),
      );
      this.persons.set(persons);

      const defaultRootPersonId = this.getDefaultRootPersonId(persons);

      if (!this.rootPersonId() && defaultRootPersonId) {
        this.rootPersonId.set(defaultRootPersonId);
        await this.loadTree(defaultRootPersonId);
      }
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }

  private async loadTree(personId: string): Promise<void> {
    this.errorMessage.set("");
    this.isLoading.set(true);

    try {
      const tree = await awaitOne<TreeResponse>(this.treeService.getTree(personId, 2, 2));
      const diagram = buildTreeDiagram(tree);
      this.rootPersonId.set(personId);
      this.tree.set(tree);
      this.diagram.set(diagram);
      window.requestAnimationFrame(() => {
        this.centerRootNode(diagram);
      });
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  private applyZoom(nextZoom: number, viewport: HTMLElement, clientX?: number, clientY?: number): void {
    const currentZoom = this.zoom();
    const clampedZoom = clamp(nextZoom, this.minZoom, this.maxZoom);

    if (Math.abs(clampedZoom - currentZoom) < 0.001) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const anchorViewportX = clientX === undefined ? viewport.clientWidth / 2 : clientX - rect.left;
    const anchorViewportY = clientY === undefined ? viewport.clientHeight / 2 : clientY - rect.top;
    const anchorContentX = (viewport.scrollLeft + anchorViewportX) / currentZoom;
    const anchorContentY = (viewport.scrollTop + anchorViewportY) / currentZoom;

    this.zoom.set(clampedZoom);

    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, anchorContentX * clampedZoom - anchorViewportX);
      viewport.scrollTop = Math.max(0, anchorContentY * clampedZoom - anchorViewportY);
    });
  }

  private getDefaultRootPersonId(persons: Person[]): string {
    const primaryPersonId = this.authService.user()?.primaryPersonId;

    if (primaryPersonId && persons.some((person) => person.id === primaryPersonId)) {
      return primaryPersonId;
    }

    return persons[0]?.id ?? "";
  }

  private centerRootNode(diagram: TreeDiagram): void {
    const viewport = this.viewportRef?.nativeElement;
    const rootNode = diagram.nodes.find((node) => node.role === "root");

    if (!viewport || !rootNode) {
      return;
    }

    const [minX, minY] = parseViewBoxOrigin(diagram.viewBox);
    const zoom = this.zoom();
    const rootCenterX = (rootNode.x + rootNode.width / 2 - minX) * zoom;
    const rootCenterY = (rootNode.y + rootNode.height / 2 - minY) * zoom;

    viewport.scrollLeft = Math.max(0, rootCenterX - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, rootCenterY - viewport.clientHeight / 2);
  }
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function wrapNodeTitle(value: string): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return ["Без імені"];
  }

  let index = 0;
  let firstLine = "";

  while (index < words.length) {
    const word = words[index];

    if (firstLine.length === 0) {
      if (word.length > 18) {
        firstLine = fitWord(word, 18);
        index += 1;
        break;
      }

      firstLine = word;
      index += 1;
      continue;
    }

    const candidate = `${firstLine} ${word}`;

    if (candidate.length > 18) {
      break;
    }

    firstLine = candidate;
    index += 1;
  }

  if (index >= words.length) {
    return [firstLine];
  }

  return [firstLine, truncate(words.slice(index).join(" "), 18)];
}

function fitWord(word: string, limit: number): string {
  return word.length > limit ? truncate(word, limit) : word;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseViewBoxOrigin(viewBox: string): [number, number] {
  const [minX = 0, minY = 0] = viewBox.split(/\s+/).map((value) => Number(value));
  return [minX, minY];
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Помилка запиту";
  }

  return "Помилка запиту";
}
