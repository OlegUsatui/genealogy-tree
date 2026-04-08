import type { FamilyShareLinkResponse, Person, TreeResponse } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, ElementRef, ViewChild, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";

import { buildPhotoInitials, isSupportedPhotoUrl } from "../lib/photo";
import { MATERIAL_IMPORTS } from "../material";
import { AuthService } from "../services/auth.service";
import { awaitOne } from "../services/await-one";
import { FamilySpacesService } from "../services/family-spaces.service";
import { PersonsService } from "../services/persons.service";
import { TreeService } from "../services/tree.service";
import { buildTreeDiagram, type TreeDiagram, type TreeDiagramNode } from "./tree-diagram";

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <ng-container *ngIf="diagram() as diagram; else emptyState">
      <section class="tree-page">
        <div class="tree-hud" *ngIf="isLoading() || errorMessage() || rootPersonId()">
          <div class="tree-hud-actions" *ngIf="rootPersonId()">
            <a mat-stroked-button [routerLink]="['/graph', rootPersonId()]">
              Мережа родини
            </a>
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="isGeneratingShareLink()"
              (click)="generateShareLink()"
            >
              {{ isGeneratingShareLink() ? "Створюю посилання..." : "Поділитися сім’єю" }}
            </button>
          </div>

          <div class="share-card" *ngIf="shareLink() as shareLink">
            <div class="share-card-header">
              <div class="share-card-copy">
                <strong>Публічне посилання на мережу родини</strong>
                <p class="muted">
                  Надішліть його родичу. Він зможе переглянути всю мережу родини і додати себе без реєстрації.
                </p>
              </div>

              <button type="button" class="share-card-close" aria-label="Закрити посилання" (click)="closeShareLink()">
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div class="share-card-row">
              <input class="share-link-input" [value]="shareLink" readonly (focus)="$any($event.target).select()">
              <button mat-stroked-button type="button" (click)="copyShareLink()">Копіювати</button>
            </div>
          </div>

          <mat-progress-bar *ngIf="isLoading()" mode="indeterminate"></mat-progress-bar>
          <p class="error-text tree-error" *ngIf="errorMessage()">{{ errorMessage() }}</p>
        </div>

        <div class="node-action-backdrop" *ngIf="nodeActionMenu()" (click)="closeNodeActionMenu()"></div>
        <div
          class="node-action-menu"
          *ngIf="nodeActionMenu() as menu"
          [style.left.px]="menu.left"
          [style.top.px]="menu.top"
          (click)="$event.stopPropagation()"
        >
          <button mat-flat-button color="primary" type="button" (click)="openPersonProfile(menu.personId)">
            Профіль
          </button>
          <button mat-stroked-button type="button" (click)="openPersonTree(menu.personId)">
            Дерево
          </button>
          <button mat-stroked-button type="button" (click)="openPersonGraph(menu.personId)">
            Мережа
          </button>
          <div class="node-action-divider"></div>
          <button mat-stroked-button type="button" (click)="openCreateRelative(menu.personId, 'parents')">
            Додати батька / матір
          </button>
          <button mat-stroked-button type="button" (click)="openCreateRelative(menu.personId, 'children')">
            Додати дитину
          </button>
          <button mat-stroked-button type="button" (click)="openCreateRelative(menu.personId, 'spouses')">
            Додати партнера / партнерку
          </button>
        </div>

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
          <div class="diagram-canvas">
            <svg
              class="tree-svg"
              [attr.viewBox]="diagram.viewBox"
              [style.width.px]="diagram.width"
              [style.height.px]="diagram.height"
              [style.transform]="sceneTransform()"
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
                [class.sibling-node]="node.role === 'sibling'"
                [class.spouse-node]="node.role === 'spouse'"
                [class.node-action-open]="nodeActionMenu()?.personId === node.person.id"
                [attr.transform]="'translate(' + node.x + ',' + node.y + ')'"
                (click)="openNodeActionMenu(node.person.id, $event)"
              >
                <rect
                  class="tree-node-card"
                  [attr.width]="node.width"
                  [attr.height]="node.height"
                  rx="24"
                  ry="24"
                ></rect>

                <text class="tree-node-badge" [attr.x]="node.width / 2" y="22" text-anchor="middle">
                  {{ nodeRoleLabel(node) }}
                </text>
                <circle class="tree-node-photo-frame" [attr.cx]="node.width / 2" cy="58" r="32"></circle>
                <defs>
                  <clipPath [attr.id]="nodePhotoClipId(node.person.id)">
                    <circle [attr.cx]="node.width / 2" cy="58" r="28"></circle>
                  </clipPath>
                </defs>
                <ng-container *ngIf="renderablePhotoUrl(node.person) as photoUrl; else nodePhotoFallback">
                  <image
                    [attr.href]="photoUrl"
                    [attr.x]="node.width / 2 - 28"
                    y="30"
                    width="56"
                    height="56"
                    preserveAspectRatio="xMidYMid slice"
                    [attr.clip-path]="'url(#' + nodePhotoClipId(node.person.id) + ')'"
                  ></image>
                </ng-container>
                <ng-template #nodePhotoFallback>
                  <text class="tree-node-photo-fallback" [attr.x]="node.width / 2" y="64" text-anchor="middle">
                    {{ photoInitials(node.person) }}
                  </text>
                </ng-template>
                <text class="tree-node-title" [attr.x]="node.width / 2" y="106" text-anchor="middle">
                  <tspan
                    *ngFor="let line of titleLines(node.person); let index = index"
                    [attr.x]="node.width / 2"
                    [attr.dy]="index === 0 ? 0 : 18"
                  >
                    {{ line }}
                  </tspan>
                </text>
                <text class="tree-node-meta" [attr.x]="node.width / 2" y="138" text-anchor="middle">
                  <tspan
                    *ngFor="let line of metaLines(node.person); let index = index"
                    [attr.x]="node.width / 2"
                    [attr.dy]="index === 0 ? 0 : 14"
                  >
                    {{ line }}
                  </tspan>
                </text>
              </g>
            </svg>
          </div>
        </div>
      </section>
    </ng-container>

    <ng-template #emptyState>
      <section class="tree-page tree-page--empty">
        <div class="empty-state tree-empty-state">Немає достатньо даних для побудови дерева.</div>
      </section>
    </ng-template>
  `,
  styles: [
    `
      .tree-page {
        position: relative;
        width: 100%;
        min-height: calc(100dvh - 88px);
      }

      .tree-page--empty {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tree-hud {
        position: absolute;
        top: 18px;
        left: 18px;
        right: 18px;
        z-index: 3;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      }

      .tree-hud > * {
        pointer-events: auto;
      }

      .tree-hud-actions {
        display: flex;
        justify-content: flex-start;
        flex-wrap: wrap;
        gap: 10px;
      }

      .share-card {
        align-self: flex-start;
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: min(560px, 100%);
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.16), transparent 42%);
        box-shadow: 0 18px 40px rgba(31, 53, 79, 0.12);
      }

      .share-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
      }

      .share-card-close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        flex: 0 0 auto;
        border: 1px solid rgba(96, 114, 123, 0.16);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.82);
        color: var(--text);
        cursor: pointer;
        transition:
          border-color 120ms ease,
          background-color 120ms ease,
          transform 120ms ease;
      }

      .share-card-close:hover {
        border-color: rgba(53, 95, 83, 0.28);
        background: rgba(255, 255, 255, 0.98);
        transform: translateY(-1px);
      }

      .share-card-close span {
        display: block;
        font-size: 22px;
        line-height: 1;
      }

      .share-card-copy {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .share-card-copy p {
        margin: 0;
      }

      .share-card-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
      }

      .share-link-input {
        width: 100%;
        min-width: 0;
        min-height: 44px;
        padding: 0 14px;
        border-radius: 12px;
        border: 1px solid rgba(96, 114, 123, 0.16);
        background: rgba(255, 255, 255, 0.92);
        color: var(--text);
        font: inherit;
      }

      .node-action-backdrop {
        position: fixed;
        inset: 0;
        z-index: 4;
      }

      .node-action-menu {
        position: fixed;
        z-index: 5;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 232px;
        padding: 12px;
        border-radius: 18px;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.16), transparent 42%);
        box-shadow: 0 18px 40px rgba(31, 53, 79, 0.18);
      }

      .node-action-divider {
        height: 1px;
        margin: 2px 0;
        background: rgba(127, 160, 200, 0.18);
      }

      .tree-error {
        align-self: flex-start;
        margin: 0;
        padding: 10px 14px;
        border-radius: 14px;
        background: rgba(255, 248, 248, 0.94);
        border: 1px solid rgba(196, 114, 114, 0.18);
        box-shadow: 0 10px 30px rgba(29, 38, 47, 0.08);
      }

      .tree-empty-state {
        width: min(520px, calc(100% - 32px));
        padding: 32px 24px;
        border-radius: 24px;
        background: rgba(248, 252, 255, 0.94);
        box-shadow: var(--shadow);
      }

      .diagram-scroll {
        position: relative;
        overflow: hidden;
        width: 100%;
        min-height: calc(100dvh - 88px);
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
        width: 100%;
        min-height: calc(100dvh - 88px);
      }

      .tree-svg {
        position: absolute;
        top: 0;
        left: 0;
        display: block;
        transform-origin: 0 0;
        will-change: transform;
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

      .tree-node-group.node-action-open .tree-node-card,
      .tree-node-group:hover .tree-node-card {
        stroke: rgba(31, 103, 198, 0.42);
      }

      .tree-node-card {
        stroke: rgba(66, 108, 161, 0.16);
        stroke-width: 1.5;
        filter: url(#nodeShadow);
        transition: transform 0.18s ease, stroke 0.18s ease;
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

      .sibling-node .tree-node-card {
        fill: rgba(236, 244, 255, 0.98);
      }

      .spouse-node .tree-node-card {
        fill: rgba(230, 240, 255, 0.98);
      }

      .tree-node-badge {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        fill: rgba(73, 111, 157, 0.72);
      }

      .tree-node-title {
        font-size: 17px;
        font-weight: 800;
        fill: #17324d;
      }

      .tree-node-meta {
        font-size: 12px;
        fill: rgba(86, 120, 162, 0.88);
      }

      .tree-node-photo-frame {
        fill: rgba(255, 255, 255, 0.98);
        stroke: rgba(66, 108, 161, 0.14);
        stroke-width: 1.2;
      }

      .tree-node-photo-fallback {
        font-size: 18px;
        font-weight: 800;
        fill: #234261;
      }

      @media (max-width: 720px) {
        .tree-page,
        .diagram-scroll {
          min-height: calc(100dvh - 146px);
        }

        .diagram-canvas {
          min-height: calc(100dvh - 146px);
        }

        .tree-hud {
          top: 14px;
          left: 14px;
          right: 14px;
        }

        .share-card-row {
          grid-template-columns: 1fr;
        }

        .share-card-header {
          flex-direction: column;
          align-items: stretch;
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
  private readonly familySpacesService = inject(FamilySpacesService);
  private readonly snackBar = inject(MatSnackBar);

  readonly errorMessage = signal("");
  readonly isLoading = signal(false);
  readonly tree = signal<TreeResponse | null>(null);
  readonly diagram = signal<TreeDiagram | null>(null);
  readonly rootPersonId = signal<string | null>(null);
  readonly persons = signal<Person[]>([]);
  readonly isPanning = signal(false);
  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly nodeActionMenu = signal<NodeActionMenuState | null>(null);
  readonly shareLink = signal("");
  readonly isGeneratingShareLink = signal(false);
  readonly minZoom = 0.04;
  readonly maxZoom = 10;

  private panState: {
    pointerId: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null = null;
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private pinchState: {
    pointerIds: [number, number];
    startDistance: number;
    startZoom: number;
    anchorContentX: number;
    anchorContentY: number;
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
    return wrapNodeTitle(this.displayName(person), 16);
  }

  sceneTransform(): string {
    return `translate3d(${this.panX()}px, ${this.panY()}px, 0) scale(${this.zoom()})`;
  }

  metaLines(person: Person): string[] {
    return wrapNodeMeta([
      person.birthDate,
      person.birthPlace,
      person.deathDate ? `† ${person.deathDate}` : null,
    ], 22);
  }

  renderablePhotoUrl(person: Person): string | null {
    return isSupportedPhotoUrl(person.photoUrl) ? person.photoUrl : null;
  }

  photoInitials(person: Person): string {
    return buildPhotoInitials(person.firstName, person.lastName);
  }

  nodePhotoClipId(personId: string): string {
    return `tree-node-photo-${personId}`;
  }

  nodeRoleLabel(node: TreeDiagramNode): string {
    switch (node.role) {
      case "root":
        return "ЦЕНТР";
      case "ancestor":
        return "ПРЕДОК";
      case "descendant":
        return "НАЩАДОК";
      case "sibling":
        return "БРАТ / СЕСТРА";
      case "spouse":
        return "ПАРТНЕР";
    }
  }

  openNodeActionMenu(personId: string, event: MouseEvent): void {
    if (this.suppressNodeClick) {
      return;
    }

    event.stopPropagation();

    const currentTarget = event.currentTarget;

    if (!(currentTarget instanceof SVGGraphicsElement)) {
      return;
    }

    const rect = currentTarget.getBoundingClientRect();
    const menuWidth = 168;
    const menuHeight = 320;
    const viewportMargin = 16;
    const preferredLeft = rect.right + 12;
    const fallbackLeft = rect.left - menuWidth - 12;
    const left = preferredLeft + menuWidth + viewportMargin <= window.innerWidth
      ? preferredLeft
      : Math.max(viewportMargin, fallbackLeft);
    const top = clamp(
      rect.top + rect.height / 2 - menuHeight / 2,
      viewportMargin,
      window.innerHeight - menuHeight - viewportMargin,
    );

    this.nodeActionMenu.set({
      personId,
      left,
      top,
    });
  }

  closeNodeActionMenu(): void {
    this.nodeActionMenu.set(null);
  }

  async openPersonProfile(personId: string): Promise<void> {
    this.closeNodeActionMenu();
    await this.router.navigate(["/persons", personId]);
  }

  async openPersonTree(personId: string): Promise<void> {
    this.closeNodeActionMenu();

    if (personId === this.rootPersonId()) {
      await this.loadTree(personId);
      return;
    }

    await this.router.navigate(["/tree", personId]);
  }

  async openPersonGraph(personId: string): Promise<void> {
    this.closeNodeActionMenu();
    await this.router.navigate(["/graph", personId]);
  }

  async openCreateRelative(personId: string, group: "parents" | "children" | "spouses"): Promise<void> {
    this.closeNodeActionMenu();
    await this.router.navigate(["/persons/new"], {
      queryParams: {
        relatedTo: personId,
        group,
        returnTreePersonId: this.rootPersonId(),
      },
    });
  }

  async generateShareLink(): Promise<void> {
    const rootPersonId = this.rootPersonId();

    if (!rootPersonId) {
      return;
    }

    this.isGeneratingShareLink.set(true);

    try {
      const response = await awaitOne<FamilyShareLinkResponse>(this.familySpacesService.createShare(rootPersonId));
      this.shareLink.set(response.shareUrl);
      await copyTextToClipboard(response.shareUrl);
      this.snackBar.open("Посилання на сім’ю створено і скопійовано.", "Закрити", {
        duration: 3200,
      });
    } catch (error) {
      this.snackBar.open(readApiError(error), "Закрити", {
        duration: 3200,
      });
    } finally {
      this.isGeneratingShareLink.set(false);
    }
  }

  async copyShareLink(): Promise<void> {
    const shareLink = this.shareLink();

    if (!shareLink) {
      return;
    }

    try {
      await copyTextToClipboard(shareLink);
      this.snackBar.open("Посилання скопійовано.", "Закрити", { duration: 2400 });
    } catch {
      this.snackBar.open("Не вдалося скопіювати посилання.", "Закрити", { duration: 2400 });
    }
  }

  closeShareLink(): void {
    this.shareLink.set("");
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const viewport = event.currentTarget;

    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    const direction = event.deltaY > 0 ? 0.12 : -0.12;
    this.applyZoom(this.zoom() + direction, viewport, event.clientX, event.clientY);
  }

  startPan(event: PointerEvent): void {
    this.closeNodeActionMenu();
    const viewport = event.currentTarget;

    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activePointers.size === 2) {
      this.beginPinch(viewport);
      return;
    }

    if (event.button !== 0 || this.activePointers.size > 1) {
      return;
    }

    if (isTreeNodeTarget(event.target)) {
      return;
    }

    this.panState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: this.panX(),
      startPanY: this.panY(),
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
    this.isPanning.set(true);
  }

  movePan(event: PointerEvent): void {
    if (this.activePointers.has(event.pointerId)) {
      this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (this.pinchState) {
      const [firstPointerId, secondPointerId] = this.pinchState.pointerIds;
      const firstPointer = this.activePointers.get(firstPointerId);
      const secondPointer = this.activePointers.get(secondPointerId);

      if (!firstPointer || !secondPointer) {
        return;
      }

      const viewport = event.currentTarget;

      if (!(viewport instanceof HTMLElement)) {
        return;
      }

      event.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const midpointX = (firstPointer.x + secondPointer.x) / 2 - rect.left;
      const midpointY = (firstPointer.y + secondPointer.y) / 2 - rect.top;
      const distance = measurePointerDistance(firstPointer, secondPointer);
      const nextZoom = clamp((distance / this.pinchState.startDistance) * this.pinchState.startZoom, this.minZoom, this.maxZoom);

      this.zoom.set(nextZoom);
      this.panX.set(midpointX - this.pinchState.anchorContentX * nextZoom);
      this.panY.set(midpointY - this.pinchState.anchorContentY * nextZoom);
      return;
    }

    if (!this.panState || event.pointerId !== this.panState.pointerId) {
      return;
    }

    event.preventDefault();

    const deltaX = event.clientX - this.panState.startX;
    const deltaY = event.clientY - this.panState.startY;

    this.panX.set(this.panState.startPanX + deltaX);
    this.panY.set(this.panState.startPanY + deltaY);
    this.panState.moved ||= Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;
  }

  endPan(event: PointerEvent): void {
    this.activePointers.delete(event.pointerId);

    if (this.pinchState) {
      const viewport = event.currentTarget;

      if (viewport instanceof HTMLElement && viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
      }

      if (this.activePointers.size < 2 || this.pinchState.pointerIds.includes(event.pointerId)) {
        this.pinchState = null;
        this.suppressNodeClickOnce();
      }
    }

    if (!this.panState || event.pointerId !== this.panState.pointerId) {
      return;
    }

    const viewport = event.currentTarget;
    const { pointerId, moved } = this.panState;

    if (viewport instanceof HTMLElement && viewport.hasPointerCapture(pointerId)) {
      viewport.releasePointerCapture(pointerId);
    }

    this.panState = null;
    this.isPanning.set(false);

    if (moved) {
      this.suppressNodeClickOnce();
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
    this.closeNodeActionMenu();
    this.errorMessage.set("");
    this.isLoading.set(true);

    try {
      const tree = await awaitOne<TreeResponse>(this.treeService.getTree(personId, 4, 4));
      const diagram = buildTreeDiagram(tree);
      this.rootPersonId.set(personId);
      this.tree.set(tree);
      this.diagram.set(diagram);
      window.requestAnimationFrame(() => {
        this.fitDiagramToViewport(diagram);
        window.requestAnimationFrame(() => {
          this.centerRootNode(diagram);
        });
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
    const anchorContentX = (anchorViewportX - this.panX()) / currentZoom;
    const anchorContentY = (anchorViewportY - this.panY()) / currentZoom;

    this.zoom.set(clampedZoom);
    this.panX.set(anchorViewportX - anchorContentX * clampedZoom);
    this.panY.set(anchorViewportY - anchorContentY * clampedZoom);
  }

  private beginPinch(viewport: HTMLElement): void {
    const pointers = [...this.activePointers.entries()];

    if (pointers.length < 2) {
      return;
    }

    const [[firstPointerId, firstPointer], [secondPointerId, secondPointer]] = pointers;
    const startDistance = measurePointerDistance(firstPointer, secondPointer);

    if (startDistance < 8) {
      return;
    }

    if (this.panState) {
      if (viewport.hasPointerCapture(this.panState.pointerId)) {
        viewport.releasePointerCapture(this.panState.pointerId);
      }

      this.panState = null;
      this.isPanning.set(false);
    }

    viewport.setPointerCapture(firstPointerId);
    viewport.setPointerCapture(secondPointerId);

    const rect = viewport.getBoundingClientRect();
    const midpointX = (firstPointer.x + secondPointer.x) / 2 - rect.left;
    const midpointY = (firstPointer.y + secondPointer.y) / 2 - rect.top;
    const currentZoom = this.zoom();

    this.pinchState = {
      pointerIds: [firstPointerId, secondPointerId],
      startDistance,
      startZoom: currentZoom,
      anchorContentX: (midpointX - this.panX()) / currentZoom,
      anchorContentY: (midpointY - this.panY()) / currentZoom,
    };
  }

  private getDefaultRootPersonId(persons: Person[]): string {
    const primaryPersonId = this.authService.user()?.primaryPersonId;

    if (primaryPersonId && persons.some((person) => person.id === primaryPersonId)) {
      return primaryPersonId;
    }

    return persons[0]?.id ?? "";
  }

  private fitDiagramToViewport(diagram: TreeDiagram): void {
    const viewport = this.viewportRef?.nativeElement;

    if (!viewport || diagram.width <= 0 || diagram.height <= 0) {
      return;
    }

    const framePadding = 48;
    const availableWidth = Math.max(120, viewport.clientWidth - framePadding * 2);
    const availableHeight = Math.max(120, viewport.clientHeight - framePadding * 2);
    const widthRatio = availableWidth / diagram.width;
    const heightRatio = availableHeight / diagram.height;
    const fitZoom = clamp(Math.min(widthRatio, heightRatio), this.minZoom, this.maxZoom);

    this.zoom.set(fitZoom);
    this.panX.set((viewport.clientWidth - diagram.width * fitZoom) / 2);
    this.panY.set((viewport.clientHeight - diagram.height * fitZoom) / 2);
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

    this.panX.set(viewport.clientWidth / 2 - rootCenterX);
    this.panY.set(viewport.clientHeight / 2 - rootCenterY);
  }

  private suppressNodeClickOnce(): void {
    this.suppressNodeClick = true;
    window.setTimeout(() => {
      this.suppressNodeClick = false;
    }, 0);
  }
}

interface NodeActionMenuState {
  personId: string;
  left: number;
  top: number;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function isTreeNodeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".tree-node-group") !== null;
}

function wrapNodeTitle(value: string, limit = 18): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return ["Без імені"];
  }

  let index = 0;
  let firstLine = "";

  while (index < words.length) {
    const word = words[index];

    if (firstLine.length === 0) {
      if (word.length > limit) {
        firstLine = fitWord(word, limit);
        index += 1;
        break;
      }

      firstLine = word;
      index += 1;
      continue;
    }

    const candidate = `${firstLine} ${word}`;

    if (candidate.length > limit) {
      break;
    }

    firstLine = candidate;
    index += 1;
  }

  if (index >= words.length) {
    return [firstLine];
  }

  return [firstLine, truncate(words.slice(index).join(" "), limit)];
}

function wrapNodeMeta(values: Array<string | null>, limit = 24): string[] {
  const parts = values.filter((value): value is string => Boolean(value)).map((value) => fitWord(value, limit));

  if (parts.length === 0) {
    return ["Дані не вказані"];
  }

  const combined = parts.join(" • ");

  if (combined.length <= limit) {
    return [combined];
  }

  if (parts.length === 2) {
    return [parts[0], truncate(parts[1], limit)];
  }

  const firstLine = parts.slice(0, 2).join(" • ");

  if (firstLine.length <= limit) {
    return [firstLine, truncate(parts[2], limit)];
  }

  return [parts[0], truncate(parts.slice(1).join(" • "), limit)];
}

function fitWord(word: string, limit: number): string {
  return word.length > limit ? truncate(word, limit) : word;
}

function measurePointerDistance(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
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

async function copyTextToClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  throw new Error("Clipboard API is not available");
}
