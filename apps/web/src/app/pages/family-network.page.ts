import type { FamilyGraphResponse, Person, Relationship } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, ElementRef, ViewChild, effect, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { hierarchy, tree as d3Tree } from "d3-hierarchy";

import { PersonSidePanelComponent } from "../components/person-side-panel.component";
import { formatPersonDisplayName } from "../lib/person-name";
import { buildPhotoInitials, isSupportedPhotoUrl } from "../lib/photo";
import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { GraphService } from "../services/graph.service";
import { LoadingOverlayService } from "../services/loading-overlay.service";

const nodeWidth = 214;
const nodeHeight = 186;
const horizontalGap = 304;
const spousePairGap = 252;
const branchClusterGap = 132;
const majorBranchGap = 520;
const sameBandFocusGap = 420;
const levelGap = 286;
const diagramPadding = 192;
const forestSiblingGap = 132;
const forestTreeGap = 760;
const forestSpouseGap = 72;
const forestSpouseStackGap = 24;
const forestSpouseCollisionGap = 28;

type NetworkNodeRole = "focus" | "ancestor" | "descendant" | "same";

type NetworkNode = {
  key?: string;
  person: Person;
  role: NetworkNodeRole;
  level: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
};

type NetworkLink = {
  key: string;
  relationship: Relationship;
  kind: "branch" | "spouse";
  path: string;
};

type NetworkDiagram = {
  nodes: NetworkNode[];
  links: NetworkLink[];
  width: number;
  height: number;
  viewBox: string;
};

type PersonPanelState = {
  person: Person;
  contextLabel: string;
};

type NetworkLayoutMode = "compact" | "forest";

type NetworkBranchKind = "focus" | "up" | "down";

type NetworkBranchMeta = {
  key: string;
  kind: NetworkBranchKind;
  rootPersonId: string | null;
};

type ForestHierarchyNodeData = {
  id: string;
  person: Person | null;
  children: ForestHierarchyNodeData[];
};

type InternalForestNode = NetworkNode & {
  key: string;
  clusterKey: string;
};

type ForestBranchEdge = {
  relationship: Relationship;
  sourceKey: string;
  targetKey: string;
};

type ForestCluster = {
  key: string;
  rootIds: string[];
};

type ForestClusterLayout = {
  clusterKey: string;
  rootIds: string[];
  nodes: InternalForestNode[];
  branchEdges: ForestBranchEdge[];
  width: number;
  centerX: number;
};

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, PersonSidePanelComponent, ...MATERIAL_IMPORTS],
  template: `
    <section class="network-page-shell">
      <div class="network-card">
        <app-person-side-panel
          *ngIf="selectedPersonPanel() as panel"
          [person]="panel.person"
          [contextLabel]="panel.contextLabel"
          (close)="closePersonPanel()"
          (openProfile)="openSelectedPersonProfile()"
          (openTree)="openSelectedPersonTree()"
          (openGraph)="openSelectedPersonGraph()"
          (addParent)="openSelectedPersonCreateRelative('parents')"
          (addChild)="openSelectedPersonCreateRelative('children')"
          (addSpouse)="openSelectedPersonCreateRelative('spouses')"
        ></app-person-side-panel>

        <div class="network-status" *ngIf="isLoading() || errorMessage()">
          <mat-progress-bar *ngIf="isLoading()" mode="indeterminate"></mat-progress-bar>
          <p class="error-text network-error" *ngIf="errorMessage()">{{ errorMessage() }}</p>
        </div>

        <div class="network-layout-switch" *ngIf="!isLoading() && !errorMessage()">
          <button
            type="button"
            class="network-layout-button"
            [class.is-active]="layoutMode() === 'compact'"
            (click)="setLayoutMode('compact')"
          >
            Компактно
          </button>
          <button
            type="button"
            class="network-layout-button"
            [class.is-active]="layoutMode() === 'forest'"
            (click)="setLayoutMode('forest')"
          >
            Окремі дерева
          </button>
        </div>

        <div
          #viewport
          class="network-canvas"
          [class.is-panning]="isPanning()"
          (wheel)="handleWheel($event)"
          (pointerdown)="startPan($event)"
          (pointermove)="movePan($event)"
          (pointerup)="endPan($event)"
          (pointercancel)="endPan($event)"
          (pointerleave)="endPan($event)"
        >
          <div class="network-scene">
          <svg
            class="network-svg"
            [attr.viewBox]="viewBox()"
            [style.width.px]="diagramWidth()"
            [style.height.px]="diagramHeight()"
            [style.transform]="sceneTransform()"
          >
            <defs>
              <filter id="familyNetworkNodeShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="rgba(48, 93, 148, 0.18)"></feDropShadow>
              </filter>
            </defs>

            <g *ngFor="let link of links()">
              <g
                class="network-link-group"
                [class.network-link-group--active]="selectedLinkKey() === link.key"
                [class.network-link-group--muted]="selectedLinkKey() !== null && selectedLinkKey() !== link.key"
                (click)="toggleLinkHighlight(link, $event)"
              >
                <path class="network-link-hit" [attr.d]="link.path"></path>
                <path
                  class="network-link"
                  [class.network-link--active]="selectedLinkKey() === link.key"
                  [class.network-link--spouse]="link.kind === 'spouse'"
                  [attr.d]="link.path"
                ></path>
              </g>
            </g>

            <g
              *ngFor="let node of nodes()"
              class="network-node-group"
              [class.focus-node]="node.role === 'focus'"
              [class.ancestor-node]="node.role === 'ancestor'"
              [class.descendant-node]="node.role === 'descendant'"
              [class.same-level-node]="node.role === 'same'"
              [class.node-action-open]="selectedPersonPanel()?.person?.id === node.person.id"
              [attr.transform]="'translate(' + node.x + ',' + node.y + ')'"
              (click)="openPersonPanel(node, $event)"
              (contextmenu)="openPersonPanel(node, $event)"
            >
              <rect
                class="network-node-card"
                [attr.width]="node.width"
                [attr.height]="node.height"
                rx="24"
                ry="24"
              ></rect>

              <text class="network-node-badge" [attr.x]="node.width / 2" y="22" text-anchor="middle">
                {{ nodeRoleLabel(node) }}
              </text>

              <circle class="network-node-photo-frame" [attr.cx]="node.width / 2" cy="58" r="32"></circle>
              <defs>
                <clipPath [attr.id]="nodePhotoClipId(node.key ?? node.person.id)">
                  <circle [attr.cx]="node.width / 2" cy="58" r="28"></circle>
                </clipPath>
              </defs>

              <ng-container *ngIf="renderablePhotoUrl(node.person) as photoUrl; else photoFallback">
                <image
                  [attr.href]="photoUrl"
                  [attr.x]="node.width / 2 - 28"
                  y="30"
                  width="56"
                  height="56"
                  preserveAspectRatio="xMidYMid slice"
                  [attr.clip-path]="'url(#' + nodePhotoClipId(node.key ?? node.person.id) + ')'"
                ></image>
              </ng-container>

              <ng-template #photoFallback>
                <text class="network-node-photo-fallback" [attr.x]="node.width / 2" y="64" text-anchor="middle">
                  {{ photoInitials(node.person) }}
                </text>
              </ng-template>

              <text class="network-node-title" [attr.x]="node.width / 2" y="102" text-anchor="middle">
                <tspan
                  *ngFor="let line of titleLines(node.person); let index = index"
                  [attr.x]="node.width / 2"
                  [attr.dy]="index === 0 ? 0 : 18"
                >
                  {{ line }}
                </tspan>
              </text>

              <text class="network-node-meta" [attr.x]="node.width / 2" y="156" text-anchor="middle">
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
        <div
          class="empty-state network-empty-state"
          *ngIf="hasCompletedInitialGraphLoad() && !isLoading() && !errorMessage() && nodes().length === 0"
        >
          <div class="network-empty-card">
            <h3>Немає даних для побудови мережі</h3>
            <p class="muted">Для цієї людини ще не знайдено достатньо зв’язків, щоб показати всю родину.</p>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
      }

      .network-page-shell {
        position: relative;
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
      }

      .network-card {
        position: relative;
        display: flex;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        overflow: hidden;
      }

      .network-status {
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

      .network-status > * {
        pointer-events: auto;
      }

      .network-layout-switch {
        position: absolute;
        top: 18px;
        right: 18px;
        z-index: 4;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px;
        border-radius: 18px;
        background: rgba(250, 252, 248, 0.92);
        border: 1px solid rgba(112, 139, 92, 0.16);
        box-shadow: 0 16px 36px rgba(31, 51, 29, 0.12);
        backdrop-filter: blur(10px);
      }

      .network-layout-button {
        appearance: none;
        border: 0;
        border-radius: 14px;
        padding: 10px 14px;
        background: transparent;
        color: rgba(48, 74, 44, 0.74);
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
        cursor: pointer;
        transition:
          background-color 0.18s ease,
          color 0.18s ease,
          box-shadow 0.18s ease;
      }

      .network-layout-button:hover {
        background: rgba(221, 235, 209, 0.58);
        color: #254128;
      }

      .network-layout-button.is-active {
        background: linear-gradient(180deg, rgba(126, 161, 94, 0.96), rgba(92, 132, 67, 0.96));
        color: #f7fbf4;
        box-shadow: 0 10px 20px rgba(63, 96, 48, 0.24);
      }

      .network-error {
        align-self: flex-start;
        margin: 0;
        padding: 10px 14px;
        border-radius: 14px;
        background: rgba(255, 248, 248, 0.94);
        border: 1px solid rgba(196, 114, 114, 0.18);
        box-shadow: 0 10px 30px rgba(29, 38, 47, 0.08);
      }

      .network-canvas {
        position: relative;
        display: flex;
        flex: 1 1 auto;
        width: 100%;
        min-height: 0;
        overflow: hidden;
        cursor: grab;
        touch-action: none;
        user-select: none;
        isolation: isolate;
        background:
          radial-gradient(circle at 18% 18%, rgba(157, 201, 125, 0.14), transparent 18%),
          radial-gradient(circle at 82% 16%, rgba(190, 218, 150, 0.16), transparent 18%),
          linear-gradient(180deg, rgba(250, 252, 246, 0.98), rgba(238, 245, 235, 0.97) 58%, rgba(230, 238, 229, 0.97));
      }

      .network-canvas.is-panning {
        cursor: grabbing;
      }

      .network-scene {
        position: relative;
        flex: 1 1 auto;
        width: 100%;
        min-height: 0;
      }

      .network-svg {
        position: absolute;
        top: 0;
        left: 0;
        display: block;
        transform-origin: 0 0;
        will-change: transform;
      }

      .network-link {
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 3;
        stroke: rgba(60, 101, 154, 0.24);
        opacity: 1;
        pointer-events: none;
        transition:
          stroke 0.18s ease,
          stroke-width 0.18s ease,
          opacity 0.18s ease,
          filter 0.18s ease;
      }

      .network-link-group {
        cursor: pointer;
      }

      .network-link-hit {
        fill: none;
        stroke: transparent;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 20;
        pointer-events: stroke;
      }

      .network-link-group:hover .network-link {
        stroke: rgba(52, 98, 168, 0.44);
      }

      .network-link--spouse {
        stroke: rgba(80, 130, 196, 0.28);
        stroke-dasharray: 10 8;
      }

      .network-link-group--muted .network-link {
        opacity: 0.14;
      }

      .network-link--active {
        stroke: rgba(24, 95, 192, 0.92);
        stroke-width: 6;
        filter: drop-shadow(0 0 12px rgba(26, 101, 202, 0.38));
        opacity: 1;
      }

      .network-link--active.network-link--spouse {
        stroke: rgba(18, 131, 162, 0.92);
        stroke-width: 5;
        stroke-dasharray: 12 8;
        filter: drop-shadow(0 0 12px rgba(19, 138, 171, 0.36));
      }

      .network-node-group {
        cursor: pointer;
      }

      .network-node-card {
        stroke: rgba(66, 108, 161, 0.16);
        stroke-width: 1.5;
        filter: url(#familyNetworkNodeShadow);
        transition: transform 0.18s ease, stroke 0.18s ease;
      }

      .network-node-group.node-action-open .network-node-card,
      .network-node-group:hover .network-node-card {
        stroke: rgba(31, 103, 198, 0.42);
      }

      .focus-node .network-node-card {
        fill: rgba(223, 236, 255, 0.98);
      }

      .ancestor-node .network-node-card {
        fill: rgba(241, 247, 255, 0.98);
      }

      .descendant-node .network-node-card {
        fill: rgba(234, 244, 255, 0.98);
      }

      .same-level-node .network-node-card {
        fill: rgba(230, 240, 255, 0.98);
      }

      .network-node-badge {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        fill: rgba(73, 111, 157, 0.72);
      }

      .network-node-title {
        font-size: 17px;
        font-weight: 800;
        fill: #17324d;
      }

      .network-node-meta {
        font-size: 12px;
        fill: rgba(86, 120, 162, 0.88);
      }

      .network-node-photo-frame {
        fill: rgba(255, 255, 255, 0.98);
        stroke: rgba(66, 108, 161, 0.14);
        stroke-width: 1.2;
      }

      .network-node-photo-fallback {
        font-size: 18px;
        font-weight: 800;
        fill: #234261;
      }

      .network-empty-state {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        pointer-events: none;
      }

      .network-empty-card {
        width: min(520px, calc(100% - 32px));
        padding: 32px 24px;
        border-radius: 24px;
        background: rgba(248, 252, 255, 0.94);
        box-shadow: var(--shadow);
        text-align: center;
      }

      .empty-state h3 {
        margin: 0 0 8px;
      }

      .empty-state p {
        margin: 0;
      }

      @media (max-width: 760px) {
        .network-status {
          top: 14px;
          left: 14px;
          right: 14px;
        }

        .network-layout-switch {
          top: 14px;
          right: 14px;
          left: auto;
          max-width: calc(100% - 28px);
        }

        .network-layout-button {
          padding: 9px 12px;
          font-size: 12px;
        }
      }
    `,
  ],
})
export class FamilyNetworkPageComponent {
  @ViewChild("viewport")
  private viewportRef?: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly graphService = inject(GraphService);
  private readonly loadingOverlay = inject(LoadingOverlayService);

  readonly isLoading = signal(true);
  readonly hasCompletedInitialGraphLoad = signal(false);
  readonly errorMessage = signal("");
  readonly focusPersonId = signal<string | null>(null);
  readonly nodes = signal<NetworkNode[]>([]);
  readonly links = signal<NetworkLink[]>([]);
  readonly viewBox = signal("0 0 1200 900");
  readonly diagramWidth = signal(1200);
  readonly diagramHeight = signal(900);
  readonly layoutMode = signal<NetworkLayoutMode>("forest");
  readonly selectedPersonPanel = signal<PersonPanelState | null>(null);
  readonly selectedLinkKey = signal<string | null>(null);
  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly isPanning = signal(false);
  readonly defaultMinZoom = 0.4;
  readonly absoluteMinZoom = 0.02;
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
  private currentGraph: FamilyGraphResponse | null = null;
  private currentDiagram: NetworkDiagram | null = null;

  constructor() {
    effect(
      () => {
        if (this.isLoading()) {
          this.loadingOverlay.show("family-network-page");
        } else {
          this.loadingOverlay.hide("family-network-page");
        }
      },
      { allowSignalWrites: true },
    );

    this.destroyRef.onDestroy(() => {
      this.loadingOverlay.hide("family-network-page");
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const personId = params.get("personId");

      if (!personId) {
        this.errorMessage.set("Людину не знайдено");
        this.isLoading.set(false);
        this.hasCompletedInitialGraphLoad.set(true);
        return;
      }

      this.focusPersonId.set(personId);
      void this.loadGraph(personId);
    });
  }

  titleLines(person: Person): string[] {
    return wrapLabel(formatPersonDisplayName(person) || "Без імені", 16, 3);
  }

  sceneTransform(): string {
    return `translate3d(${this.panX()}px, ${this.panY()}px, 0) scale(${this.zoom()})`;
  }

  metaLines(person: Person): string[] {
    const values = [
      person.birthDate,
      person.birthPlace,
      person.deathDate ? `† ${person.deathDate}` : null,
    ].filter((value): value is string => Boolean(value));

    if (values.length === 0) {
      return ["Дані ще не додані"];
    }

    return wrapLabel(values.join(" • "), 24, 2);
  }

  renderablePhotoUrl(person: Person): string | null {
    return isSupportedPhotoUrl(person.photoUrl) ? person.photoUrl : null;
  }

  photoInitials(person: Person): string {
    return buildPhotoInitials(person.firstName, person.lastName);
  }

  nodePhotoClipId(nodeKey: string): string {
    return `family-network-photo-${nodeKey}`;
  }

  nodeRoleLabel(node: NetworkNode): string {
    if (node.role === "focus") {
      return "ЦЕНТР";
    }

    if (node.role === "ancestor") {
      return "ВИЩЕ";
    }

    if (node.role === "descendant") {
      return "НИЖЧЕ";
    }

    return "ТЕ САМЕ ПОКОЛІННЯ";
  }

  async openPerson(personId: string): Promise<void> {
    if (this.suppressNodeClick) {
      return;
    }

    this.closePersonPanel();
    await this.router.navigate(["/persons", personId]);
  }

  async openPersonTree(personId: string): Promise<void> {
    this.closePersonPanel();
    await this.router.navigate(["/tree", personId]);
  }

  async openPersonGraph(personId: string): Promise<void> {
    this.closePersonPanel();
    await this.router.navigate(["/graph", personId]);
  }

  async openCreateRelative(personId: string, group: "parents" | "children" | "spouses"): Promise<void> {
    this.closePersonPanel();
    await this.router.navigate(["/persons/new"], {
      queryParams: {
        relatedTo: personId,
        group,
        returnGraphPersonId: this.focusPersonId(),
      },
    });
  }

  async openSelectedPersonProfile(): Promise<void> {
    const personId = this.selectedPersonPanel()?.person.id;

    if (!personId) {
      return;
    }

    await this.openPerson(personId);
  }

  async openSelectedPersonTree(): Promise<void> {
    const personId = this.selectedPersonPanel()?.person.id;

    if (!personId) {
      return;
    }

    await this.openPersonTree(personId);
  }

  async openSelectedPersonGraph(): Promise<void> {
    const personId = this.selectedPersonPanel()?.person.id;

    if (!personId) {
      return;
    }

    await this.openPersonGraph(personId);
  }

  async openSelectedPersonCreateRelative(group: "parents" | "children" | "spouses"): Promise<void> {
    const personId = this.selectedPersonPanel()?.person.id;

    if (!personId) {
      return;
    }

    await this.openCreateRelative(personId, group);
  }

  openPersonPanel(node: NetworkNode, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.suppressNodeClick) {
      return;
    }

    if (this.selectedPersonPanel()?.person.id === node.person.id) {
      this.closePersonPanel();
      return;
    }

    this.selectedPersonPanel.set({
      person: node.person,
      contextLabel: this.nodeRoleLabel(node),
    });
  }

  toggleLinkHighlight(link: NetworkLink, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this.closePersonPanel();
    this.selectedLinkKey.update((current) => (current === link.key ? null : link.key));
  }

  closePersonPanel(): void {
    this.selectedPersonPanel.set(null);
  }

  setLayoutMode(mode: NetworkLayoutMode): void {
    if (this.layoutMode() === mode) {
      return;
    }

    this.layoutMode.set(mode);
    this.selectedLinkKey.set(null);

    if (this.currentGraph) {
      this.renderDiagram(this.currentGraph);
    }
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

    if (isNetworkNodeTarget(event.target) || isNetworkLinkTarget(event.target)) {
      return;
    }

    this.closePersonPanel();

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
      const nextZoom = clamp(
        (distance / this.pinchState.startDistance) * this.pinchState.startZoom,
        this.currentMinZoom(viewport),
        this.maxZoom,
      );

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

  private async loadGraph(personId: string): Promise<void> {
    this.closePersonPanel();
    this.selectedLinkKey.set(null);
    this.isLoading.set(true);
    this.errorMessage.set("");

    try {
      const graph = await awaitOne<FamilyGraphResponse>(this.graphService.getGraph(personId));
      this.currentGraph = graph;
      this.renderDiagram(graph);
    } catch (error) {
      this.currentGraph = null;
      this.currentDiagram = null;
      this.errorMessage.set(readApiError(error));
      this.nodes.set([]);
      this.links.set([]);
    } finally {
      this.isLoading.set(false);
      this.hasCompletedInitialGraphLoad.set(true);
    }
  }

  private applyZoom(nextZoom: number, viewport: HTMLElement, clientX?: number, clientY?: number): void {
    const currentZoom = this.zoom();
    const clampedZoom = clamp(nextZoom, this.currentMinZoom(viewport), this.maxZoom);

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

  private fitDiagramToViewport(diagram: NetworkDiagram): void {
    const viewport = this.viewportRef?.nativeElement;

    if (!viewport || diagram.width <= 0 || diagram.height <= 0) {
      return;
    }

    const framePadding = 48;
    const availableWidth = Math.max(120, viewport.clientWidth - framePadding * 2);
    const availableHeight = Math.max(120, viewport.clientHeight - framePadding * 2);
    const widthRatio = availableWidth / diagram.width;
    const heightRatio = availableHeight / diagram.height;
    const fitZoom = clamp(Math.min(widthRatio, heightRatio), this.absoluteMinZoom, this.maxZoom);

    this.zoom.set(fitZoom);
    this.panX.set((viewport.clientWidth - diagram.width * fitZoom) / 2);
    this.panY.set((viewport.clientHeight - diagram.height * fitZoom) / 2);
  }

  private currentMinZoom(viewport: HTMLElement): number {
    const diagram = this.currentDiagram;

    if (!diagram || diagram.width <= 0 || diagram.height <= 0) {
      return this.absoluteMinZoom;
    }

    const framePadding = 48;
    const availableWidth = Math.max(120, viewport.clientWidth - framePadding * 2);
    const availableHeight = Math.max(120, viewport.clientHeight - framePadding * 2);
    const fitZoom = Math.min(availableWidth / diagram.width, availableHeight / diagram.height);
    const focusNode = diagram.nodes.find((node) => node.role === "focus");

    if (!focusNode) {
      return clamp(Math.min(this.defaultMinZoom, fitZoom), this.absoluteMinZoom, this.maxZoom);
    }

    const [minX, minY] = parseViewBoxOrigin(diagram.viewBox);
    const maxX = minX + diagram.width;
    const maxY = minY + diagram.height;
    const focusCenterX = focusNode.x + focusNode.width / 2;
    const focusCenterY = focusNode.y + focusNode.height / 2;
    const centeredFitZoom = Math.min(
      (availableWidth / 2) / Math.max(focusCenterX - minX, maxX - focusCenterX, 1),
      (availableHeight / 2) / Math.max(focusCenterY - minY, maxY - focusCenterY, 1),
    );

    return clamp(Math.min(this.defaultMinZoom, fitZoom, centeredFitZoom), this.absoluteMinZoom, this.maxZoom);
  }

  private centerFocusNode(diagram: NetworkDiagram): void {
    const viewport = this.viewportRef?.nativeElement;
    const focusNode = diagram.nodes.find((node) => node.role === "focus");

    if (!viewport || !focusNode) {
      return;
    }

    const [minX, minY] = parseViewBoxOrigin(diagram.viewBox);
    const zoom = this.zoom();
    const focusCenterX = (focusNode.x + focusNode.width / 2 - minX) * zoom;
    const focusCenterY = (focusNode.y + focusNode.height / 2 - minY) * zoom;

    this.panX.set(viewport.clientWidth / 2 - focusCenterX);
    this.panY.set(viewport.clientHeight / 2 - focusCenterY);
  }

  private suppressNodeClickOnce(): void {
    this.suppressNodeClick = true;
    window.setTimeout(() => {
      this.suppressNodeClick = false;
    }, 0);
  }

  private renderDiagram(graph: FamilyGraphResponse): void {
    const diagram = buildNetworkDiagram(graph, this.layoutMode());
    this.currentDiagram = diagram;
    this.nodes.set(diagram.nodes);
    this.links.set(diagram.links);
    this.viewBox.set(diagram.viewBox);
    this.diagramWidth.set(diagram.width);
    this.diagramHeight.set(diagram.height);
    window.requestAnimationFrame(() => {
      this.fitDiagramToViewport(diagram);
      window.requestAnimationFrame(() => {
        this.centerFocusNode(diagram);
      });
    });
  }
}

function buildNetworkDiagram(
  graph: FamilyGraphResponse,
  mode: NetworkLayoutMode,
): NetworkDiagram {
  return mode === "compact" ? buildCompactNetworkDiagram(graph) : buildForestNetworkDiagram(graph);
}

function buildCompactNetworkDiagram(graph: FamilyGraphResponse): NetworkDiagram {
  if (graph.persons.length === 0) {
    return {
      nodes: [],
      links: [],
      width: 1200,
      height: 900,
      viewBox: "0 0 1200 900",
    };
  }

  const personMap = new Map(graph.persons.map((person) => [person.id, person] as const));
  const relationshipsByPerson = indexRelationships(graph.relationships);
  const levels = assignLevels(graph, relationshipsByPerson);
  const levelOrder = buildLevelOrder(graph, levels, relationshipsByPerson);
  const positionedNodes = createLegacyCompactPositionedNodes(graph, personMap, levels, levelOrder);
  const nodeMap = new Map(positionedNodes.map((node) => [node.person.id, node] as const));
  const links = graph.relationships
    .map((relationship) => {
      const first = nodeMap.get(relationship.person1Id);
      const second = nodeMap.get(relationship.person2Id);

      if (!first || !second) {
        return null;
      }

      const kind = relationship.type === "spouse" ? "spouse" : "branch";

      return {
        key: createNetworkLinkKey(kind, relationship, relationship.person1Id, relationship.person2Id),
        relationship,
        kind,
        path: kind === "spouse" ? createSpousePath(first, second) : createBranchPath(first, second),
      };
    })
    .filter((link): link is NetworkLink => link !== null);

  const minX = Math.min(...positionedNodes.map((node) => node.x)) - diagramPadding;
  const minY = Math.min(...positionedNodes.map((node) => node.y)) - diagramPadding;
  const maxX = Math.max(...positionedNodes.map((node) => node.x + node.width)) + diagramPadding;
  const maxY = Math.max(...positionedNodes.map((node) => node.y + node.height)) + diagramPadding;
  const width = maxX - minX;
  const height = maxY - minY;

  return {
    nodes: positionedNodes,
    links,
    width,
    height,
    viewBox: `${minX} ${minY} ${width} ${height}`,
  };
}

function buildForestNetworkDiagram(graph: FamilyGraphResponse): NetworkDiagram {
  if (graph.persons.length === 0) {
    return {
      nodes: [],
      links: [],
      width: 1200,
      height: 900,
      viewBox: "0 0 1200 900",
    };
  }

  const personMap = new Map(graph.persons.map((person) => [person.id, person] as const));
  const parentChildRelationships = graph.relationships.filter((relationship) => relationship.type === "parent_child");
  const spouseRelationships = graph.relationships.filter((relationship) => relationship.type === "spouse");
  const relationshipsByPerson = indexRelationships(graph.relationships);
  const levels = assignLevels(graph, relationshipsByPerson);
  const childrenByParent = groupRelationshipIds(parentChildRelationships, "person1Id", "person2Id");
  const parentsByChild = groupRelationshipIds(parentChildRelationships, "person2Id", "person1Id");
  const parentChildByPair = new Map(
    parentChildRelationships.map((relationship) => [`${relationship.person1Id}->${relationship.person2Id}`, relationship] as const),
  );
  const rootClusters = buildForestRootClusters(graph, personMap, parentChildRelationships, spouseRelationships, parentsByChild);
  const clusterLayouts = rootClusters.map((cluster) =>
    buildForestClusterLayout(cluster, graph.focusPersonId, personMap, childrenByParent, parentChildByPair, levels),
  );
  positionForestClusters(clusterLayouts);

  const primaryNodes = clusterLayouts.flatMap((layout) => layout.nodes);
  const nodeMap = new Map(primaryNodes.map((node) => [node.key, node] as const));
  const branchLinks = clusterLayouts.flatMap((layout) =>
    layout.branchEdges.reduce<NetworkLink[]>((accumulator, edge) => {
      const source = nodeMap.get(edge.sourceKey);
      const target = nodeMap.get(edge.targetKey);

      if (!source || !target) {
        return accumulator;
      }

      accumulator.push({
        key: createNetworkLinkKey("branch", edge.relationship, edge.sourceKey, edge.targetKey),
        relationship: edge.relationship,
        kind: "branch",
        path: createBranchPath(source, target),
      });

      return accumulator;
    }, []),
  );
  const spouseArtifacts = buildForestSpouseArtifacts(
    spouseRelationships,
    graph.focusPersonId,
    personMap,
    levels,
    primaryNodes,
  );
  const positionedNodes = [...primaryNodes, ...spouseArtifacts.nodes];
  const links = [...branchLinks, ...spouseArtifacts.links];

  const minX = Math.min(...positionedNodes.map((node) => node.x)) - diagramPadding;
  const minY = Math.min(...positionedNodes.map((node) => node.y)) - diagramPadding;
  const maxX = Math.max(...positionedNodes.map((node) => node.x + node.width)) + diagramPadding;
  const maxY = Math.max(...positionedNodes.map((node) => node.y + node.height)) + diagramPadding;
  const width = maxX - minX;
  const height = maxY - minY;

  return {
    nodes: positionedNodes,
    links,
    width,
    height,
    viewBox: `${minX} ${minY} ${width} ${height}`,
  };
}

function buildForestRootClusters(
  graph: FamilyGraphResponse,
  personMap: Map<string, Person>,
  parentChildRelationships: Relationship[],
  spouseRelationships: Relationship[],
  parentsByChild: Map<string, string[]>,
): ForestCluster[] {
  const rootIds = graph.persons
    .filter((person) => (parentsByChild.get(person.id) ?? []).length === 0)
    .map((person) => person.id);

  if (rootIds.length === 0) {
    return [
      {
        key: `cluster:${graph.focusPersonId}`,
        rootIds: [graph.focusPersonId],
      },
    ];
  }

  const rootSet = new Set(rootIds);
  const adjacency = new Map(rootIds.map((rootId) => [rootId, new Set<string>()] as const));

  for (const relationship of spouseRelationships) {
    if (!rootSet.has(relationship.person1Id) || !rootSet.has(relationship.person2Id)) {
      continue;
    }

    adjacency.get(relationship.person1Id)?.add(relationship.person2Id);
    adjacency.get(relationship.person2Id)?.add(relationship.person1Id);
  }

  const rootParentsByChild = new Map<string, string[]>();

  for (const relationship of parentChildRelationships) {
    if (!rootSet.has(relationship.person1Id)) {
      continue;
    }

    const values = rootParentsByChild.get(relationship.person2Id) ?? [];
    values.push(relationship.person1Id);
    rootParentsByChild.set(relationship.person2Id, values);
  }

  for (const parentIds of rootParentsByChild.values()) {
    const uniqueParentIds = [...new Set(parentIds)];

    for (let index = 0; index < uniqueParentIds.length; index += 1) {
      for (let siblingIndex = index + 1; siblingIndex < uniqueParentIds.length; siblingIndex += 1) {
        adjacency.get(uniqueParentIds[index])?.add(uniqueParentIds[siblingIndex]);
        adjacency.get(uniqueParentIds[siblingIndex])?.add(uniqueParentIds[index]);
      }
    }
  }

  const sortedRootIds = [...rootIds].sort((left, right) => comparePersons(personMap.get(left)!, personMap.get(right)!));
  const visited = new Set<string>();
  const clusters: ForestCluster[] = [];

  for (const rootId of sortedRootIds) {
    if (visited.has(rootId)) {
      continue;
    }

    const stack = [rootId];
    const component: string[] = [];
    visited.add(rootId);

    while (stack.length > 0) {
      const currentId = stack.pop();

      if (!currentId) {
        continue;
      }

      component.push(currentId);

      for (const neighborId of adjacency.get(currentId) ?? []) {
        if (visited.has(neighborId)) {
          continue;
        }

        visited.add(neighborId);
        stack.push(neighborId);
      }
    }

    const orderedRootIds = component.sort((left, right) => comparePersons(personMap.get(left)!, personMap.get(right)!));
    clusters.push({
      key: `cluster:${orderedRootIds.join("|")}`,
      rootIds: orderedRootIds,
    });
  }

  return clusters;
}

function buildForestClusterLayout(
  cluster: ForestCluster,
  focusPersonId: string,
  personMap: Map<string, Person>,
  childrenByParent: Map<string, string[]>,
  parentChildByPair: Map<string, Relationship>,
  levels: Map<string, number>,
): ForestClusterLayout {
  const layout = d3Tree<ForestHierarchyNodeData>().nodeSize([nodeWidth + forestSiblingGap, levelGap]);
  const hierarchyRoot = layout(
    hierarchy(
      buildForestHierarchy(cluster.rootIds, childrenByParent, personMap),
    ).sort((left, right) => compareForestNodes(left.data, right.data)),
  );
  const nodes: InternalForestNode[] = [];
  const branchEdges: ForestBranchEdge[] = [];

  for (const node of hierarchyRoot.descendants()) {
    const person = node.data.person;

    if (!person) {
      continue;
    }

    const cy = node.y - levelGap;
    nodes.push(
      createForestNode(
        `${cluster.key}:${person.id}`,
        cluster.key,
        person,
        node.x,
        cy,
        resolveNetworkNodeRole(person.id, focusPersonId, levels),
        levels.get(person.id) ?? 0,
      ),
    );
  }

  for (const link of hierarchyRoot.links()) {
    if (!link.source.data.person || !link.target.data.person) {
      continue;
    }

    const relationship = parentChildByPair.get(`${link.source.data.person.id}->${link.target.data.person.id}`);

    if (!relationship) {
      continue;
    }

    branchEdges.push({
      relationship,
      sourceKey: `${cluster.key}:${link.source.data.person.id}`,
      targetKey: `${cluster.key}:${link.target.data.person.id}`,
    });
  }

  if (nodes.length === 0) {
    return {
      clusterKey: cluster.key,
      rootIds: cluster.rootIds,
      nodes: [],
      branchEdges,
      width: nodeWidth,
      centerX: 0,
    };
  }

  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));

  return {
    clusterKey: cluster.key,
    rootIds: cluster.rootIds,
    nodes,
    branchEdges,
    width: maxX - minX,
    centerX: (minX + maxX) / 2,
  };
}

function buildForestHierarchy(
  rootIds: string[],
  childrenByParent: Map<string, string[]>,
  personMap: Map<string, Person>,
): ForestHierarchyNodeData {
  const visited = new Set<string>();

  return {
    id: `forest:${rootIds.join("|")}`,
    person: null,
    children: rootIds.map((rootId) => buildForestBranch(rootId, childrenByParent, personMap, visited)),
  };
}

function buildForestBranch(
  personId: string,
  childrenByParent: Map<string, string[]>,
  personMap: Map<string, Person>,
  visited: Set<string>,
): ForestHierarchyNodeData {
  const person = personMap.get(personId);

  if (!person) {
    throw new Error(`Missing person for id ${personId}`);
  }

  visited.add(personId);
  const childIds = (childrenByParent.get(personId) ?? [])
    .filter((childId) => personMap.has(childId) && !visited.has(childId))
    .sort((left, right) => comparePersons(personMap.get(left)!, personMap.get(right)!));

  return {
    id: personId,
    person,
    children: childIds.map((childId) => buildForestBranch(childId, childrenByParent, personMap, visited)),
  };
}

function compareForestNodes(left: ForestHierarchyNodeData, right: ForestHierarchyNodeData): number {
  if (left.person && right.person) {
    return comparePersons(left.person, right.person);
  }

  if (left.person) {
    return 1;
  }

  if (right.person) {
    return -1;
  }

  return left.id.localeCompare(right.id, "uk");
}

function createForestNode(
  key: string,
  clusterKey: string,
  person: Person,
  cx: number,
  cy: number,
  role: NetworkNodeRole,
  level: number,
): InternalForestNode {
  return {
    key,
    clusterKey,
    person,
    role,
    level,
    x: cx - nodeWidth / 2,
    y: cy - nodeHeight / 2,
    cx,
    cy,
    width: nodeWidth,
    height: nodeHeight,
  };
}

function resolveNetworkNodeRole(
  personId: string,
  focusPersonId: string,
  levels: Map<string, number>,
): NetworkNodeRole {
  if (personId === focusPersonId) {
    return "focus";
  }

  const level = levels.get(personId) ?? 0;

  if (level < 0) {
    return "ancestor";
  }

  if (level > 0) {
    return "descendant";
  }

  return "same";
}

function positionForestClusters(clusterLayouts: ForestClusterLayout[]): void {
  if (clusterLayouts.length === 0) {
    return;
  }

  let cursor = 0;
  const placements = new Map<string, number>();

  for (const layout of clusterLayouts) {
    const center = cursor + layout.width / 2;
    placements.set(layout.clusterKey, center);
    cursor += layout.width + forestTreeGap;
  }

  const totalWidth = cursor - forestTreeGap;
  const globalOffset = totalWidth / 2;

  for (const layout of clusterLayouts) {
    const targetCenter = (placements.get(layout.clusterKey) ?? 0) - globalOffset;
    const shiftX = targetCenter - layout.centerX;

    for (const node of layout.nodes) {
      node.x += shiftX;
      node.cx += shiftX;
    }

    layout.centerX = targetCenter;
  }
}

function buildForestSpouseArtifacts(
  spouseRelationships: Relationship[],
  focusPersonId: string,
  personMap: Map<string, Person>,
  levels: Map<string, number>,
  primaryNodes: InternalForestNode[],
): {
  nodes: InternalForestNode[];
  links: NetworkLink[];
} {
  const nodes: InternalForestNode[] = [];
  const links: NetworkLink[] = [];
  const primaryNodeByClusterPerson = new Map(
    primaryNodes.map((node) => [`${node.clusterKey}:${node.person.id}`, node] as const),
  );
  const primaryClustersByPerson = new Map<string, Set<string>>();
  const occupiedNodesByCluster = new Map<string, InternalForestNode[]>();

  for (const node of primaryNodes) {
    const clusters = primaryClustersByPerson.get(node.person.id) ?? new Set<string>();
    clusters.add(node.clusterKey);
    primaryClustersByPerson.set(node.person.id, clusters);

    const occupied = occupiedNodesByCluster.get(node.clusterKey) ?? [];
    occupied.push(node);
    occupiedNodesByCluster.set(node.clusterKey, occupied);
  }

  const spouseGroups = new Map<
    string,
    {
      clusterKey: string;
      anchor: InternalForestNode;
      entries: Array<{ relationship: Relationship; person: Person }>;
    }
  >();

  for (const relationship of spouseRelationships) {
    const candidateClusters = new Set<string>([
      ...(primaryClustersByPerson.get(relationship.person1Id) ?? []),
      ...(primaryClustersByPerson.get(relationship.person2Id) ?? []),
    ]);

    for (const clusterKey of candidateClusters) {
      const firstPrimary = primaryNodeByClusterPerson.get(`${clusterKey}:${relationship.person1Id}`);
      const secondPrimary = primaryNodeByClusterPerson.get(`${clusterKey}:${relationship.person2Id}`);

      if (firstPrimary && secondPrimary) {
        links.push({
          key: createNetworkLinkKey("spouse", relationship, firstPrimary.key, secondPrimary.key),
          relationship,
          kind: "spouse",
          path: createSpousePath(firstPrimary, secondPrimary),
        });
        continue;
      }

      const anchor = firstPrimary ?? secondPrimary;

      if (!anchor) {
        continue;
      }

      const spouseId = firstPrimary ? relationship.person2Id : relationship.person1Id;
      const spousePerson = personMap.get(spouseId);

      if (!spousePerson) {
        continue;
      }

      const spouseIsPrimaryInAnotherTree = [...(primaryClustersByPerson.get(spouseId) ?? new Set<string>())]
        .some((candidateClusterKey) => candidateClusterKey !== clusterKey);

      if (spouseIsPrimaryInAnotherTree) {
        continue;
      }

      const groupKey = `${clusterKey}:${anchor.person.id}`;
      const group = spouseGroups.get(groupKey) ?? {
        clusterKey,
        anchor,
        entries: [],
      };
      group.entries.push({
        relationship,
        person: spousePerson,
      });
      spouseGroups.set(groupKey, group);
    }
  }

  for (const group of spouseGroups.values()) {
    const occupiedNodes = occupiedNodesByCluster.get(group.clusterKey) ?? [];

    group.entries
      .sort((left, right) => comparePersons(left.person, right.person))
      .forEach((entry, index) => {
        const offset = index - (group.entries.length - 1) / 2;
        const cy = group.anchor.cy + offset * (nodeHeight + forestSpouseStackGap);
        const spouseNode = createForestNode(
          `spouse:${group.clusterKey}:${group.anchor.person.id}:${entry.person.id}`,
          group.clusterKey,
          entry.person,
          group.anchor.cx + nodeWidth + forestSpouseGap,
          cy,
          resolveNetworkNodeRole(entry.person.id, focusPersonId, levels),
          levels.get(entry.person.id) ?? group.anchor.level,
        );

        placeForestSpouseNode(spouseNode, group.anchor, occupiedNodes);
        occupiedNodes.push(spouseNode);
        nodes.push(spouseNode);
        links.push({
          key: createNetworkLinkKey("spouse", entry.relationship, group.anchor.key, spouseNode.key),
          relationship: entry.relationship,
          kind: "spouse",
          path: createSpousePath(group.anchor, spouseNode),
        });
      });
  }

  return {
    nodes,
    links,
  };
}

function placeForestSpouseNode(
  spouseNode: InternalForestNode,
  anchor: InternalForestNode,
  occupiedNodes: InternalForestNode[],
): void {
  const rightX = anchor.x + anchor.width + forestSpouseGap;
  const leftX = anchor.x - forestSpouseGap - spouseNode.width;
  const rightScore = forestPlacementCollisionScore(rightX, spouseNode.y, spouseNode.width, spouseNode.height, anchor, occupiedNodes);
  const leftScore = forestPlacementCollisionScore(leftX, spouseNode.y, spouseNode.width, spouseNode.height, anchor, occupiedNodes);
  const nextX = chooseForestSpousePlacementX(anchor, leftX, rightX, leftScore, rightScore);

  spouseNode.x = nextX;
  spouseNode.cx = nextX + spouseNode.width / 2;
}

function forestPlacementCollisionScore(
  x: number,
  y: number,
  width: number,
  height: number,
  anchor: InternalForestNode,
  occupiedNodes: InternalForestNode[],
): number {
  return occupiedNodes.reduce((total, node) => {
    if (node.key === anchor.key) {
      return total;
    }

    return total + forestRectangleOverlapArea(x, y, width, height, node);
  }, 0);
}

function chooseForestSpousePlacementX(
  anchor: InternalForestNode,
  leftX: number,
  rightX: number,
  leftScore: number,
  rightScore: number,
): number {
  if (rightScore === 0) {
    return rightX;
  }

  if (leftScore === 0) {
    return leftX;
  }

  if (leftScore < rightScore) {
    return leftX;
  }

  if (rightScore < leftScore) {
    return rightX;
  }

  return anchor.role === "focus" || anchor.role === "descendant" ? rightX : leftX;
}

function forestRectangleOverlapArea(
  x: number,
  y: number,
  width: number,
  height: number,
  node: InternalForestNode,
): number {
  const overlapWidth =
    Math.min(x + width + forestSpouseCollisionGap, node.x + node.width + forestSpouseCollisionGap)
    - Math.max(x - forestSpouseCollisionGap, node.x - forestSpouseCollisionGap);
  const overlapHeight =
    Math.min(y + height + forestSpouseCollisionGap, node.y + node.height + forestSpouseCollisionGap)
    - Math.max(y - forestSpouseCollisionGap, node.y - forestSpouseCollisionGap);

  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }

  return overlapWidth * overlapHeight;
}

function groupRelationshipIds(
  relationships: Relationship[],
  sourceKey: "person1Id" | "person2Id",
  targetKey: "person1Id" | "person2Id",
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const relationship of relationships) {
    const sourceId = relationship[sourceKey];
    const targetId = relationship[targetKey];
    const values = result.get(sourceId) ?? [];

    if (!values.includes(targetId)) {
      values.push(targetId);
      result.set(sourceId, values);
    }
  }

  return result;
}

function indexRelationships(relationships: Relationship[]): Map<string, Relationship[]> {
  const result = new Map<string, Relationship[]>();

  for (const relationship of relationships) {
    const first = result.get(relationship.person1Id) ?? [];
    first.push(relationship);
    result.set(relationship.person1Id, first);

    const second = result.get(relationship.person2Id) ?? [];
    second.push(relationship);
    result.set(relationship.person2Id, second);
  }

  return result;
}

function assignLevels(
  graph: FamilyGraphResponse,
  relationshipsByPerson: Map<string, Relationship[]>,
): Map<string, number> {
  const levels = new Map<string, number>([[graph.focusPersonId, 0]]);
  const queue = [graph.focusPersonId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (!currentId) {
      continue;
    }

    const currentLevel = levels.get(currentId) ?? 0;

    for (const relationship of relationshipsByPerson.get(currentId) ?? []) {
      const neighborId = relationship.person1Id === currentId ? relationship.person2Id : relationship.person1Id;
      const proposedLevel = relationship.type === "spouse"
        ? currentLevel
        : relationship.person1Id === currentId
          ? currentLevel + 1
          : currentLevel - 1;

      if (!levels.has(neighborId)) {
        levels.set(neighborId, proposedLevel);
        queue.push(neighborId);
      }
    }
  }

  for (const person of graph.persons) {
    if (!levels.has(person.id)) {
      levels.set(person.id, 0);
    }
  }

  return levels;
}

function buildLevelOrder(
  graph: FamilyGraphResponse,
  levels: Map<string, number>,
  relationshipsByPerson: Map<string, Relationship[]>,
): Map<number, string[]> {
  const levelMap = new Map<number, string[]>();

  for (const person of graph.persons) {
    const level = levels.get(person.id) ?? 0;
    const values = levelMap.get(level) ?? [];
    values.push(person.id);
    levelMap.set(level, values);
  }

  for (const [level, ids] of levelMap.entries()) {
    levelMap.set(
      level,
      ids.sort((left, right) => {
        const leftPerson = graph.persons.find((person) => person.id === left);
        const rightPerson = graph.persons.find((person) => person.id === right);

        if (!leftPerson || !rightPerson) {
          return 0;
        }

        return comparePersons(leftPerson, rightPerson);
      }),
    );
  }

  const sortedLevels = [...levelMap.keys()].sort((left, right) => left - right);

  for (let pass = 0; pass < 6; pass += 1) {
    for (const level of sortedLevels) {
      const ids = levelMap.get(level);

      if (!ids || ids.length < 2) {
        continue;
      }

      const currentIndex = buildIndexByLevel(levelMap);
      const nextIds = [...ids]
        .map((personId, originalIndex) => ({
          personId,
          originalIndex,
          barycenter: calculateBarycenter(personId, level, relationshipsByPerson, levels, currentIndex, originalIndex),
        }))
        .sort((left, right) => {
          if (Math.abs(left.barycenter - right.barycenter) > 0.0001) {
            return left.barycenter - right.barycenter;
          }

          return left.originalIndex - right.originalIndex;
        })
        .map((item) => item.personId);

      levelMap.set(level, compactSpousePairs(nextIds, graph.relationships, levels, level));
    }

    for (const level of [...sortedLevels].reverse()) {
      const ids = levelMap.get(level);

      if (!ids || ids.length < 2) {
        continue;
      }

      const currentIndex = buildIndexByLevel(levelMap);
      const nextIds = [...ids]
        .map((personId, originalIndex) => ({
          personId,
          originalIndex,
          barycenter: calculateBarycenter(personId, level, relationshipsByPerson, levels, currentIndex, originalIndex),
        }))
        .sort((left, right) => {
          if (Math.abs(left.barycenter - right.barycenter) > 0.0001) {
            return left.barycenter - right.barycenter;
          }

          return left.originalIndex - right.originalIndex;
        })
        .map((item) => item.personId);

      levelMap.set(level, compactSpousePairs(nextIds, graph.relationships, levels, level));
    }
  }

  return levelMap;
}

function buildIndexByLevel(levelMap: Map<number, string[]>): Map<number, Map<string, number>> {
  const result = new Map<number, Map<string, number>>();

  for (const [level, ids] of levelMap.entries()) {
    result.set(level, new Map(ids.map((id, index) => [id, index] as const)));
  }

  return result;
}

function calculateBarycenter(
  personId: string,
  level: number,
  relationshipsByPerson: Map<string, Relationship[]>,
  levels: Map<string, number>,
  currentIndex: Map<number, Map<string, number>>,
  fallback: number,
): number {
  const values: number[] = [];

  for (const relationship of relationshipsByPerson.get(personId) ?? []) {
    const otherId = relationship.person1Id === personId ? relationship.person2Id : relationship.person1Id;
    const otherLevel = levels.get(otherId);

    if (otherLevel === undefined) {
      continue;
    }

    if (relationship.type === "spouse" || Math.abs(otherLevel - level) === 1) {
      const order = currentIndex.get(otherLevel)?.get(otherId);

      if (order !== undefined) {
        values.push(order);
      }
    }
  }

  if (values.length === 0) {
    return fallback;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compactSpousePairs(
  ids: string[],
  relationships: Relationship[],
  levels: Map<string, number>,
  level: number,
): string[] {
  const nextIds = [...ids];
  const spousePairs = relationships.filter(
    (relationship) =>
      relationship.type === "spouse"
      && (levels.get(relationship.person1Id) ?? 0) === level
      && (levels.get(relationship.person2Id) ?? 0) === level,
  );

  for (const relationship of spousePairs) {
    const firstIndex = nextIds.indexOf(relationship.person1Id);
    const secondIndex = nextIds.indexOf(relationship.person2Id);

    if (firstIndex === -1 || secondIndex === -1 || Math.abs(firstIndex - secondIndex) <= 1) {
      continue;
    }

    const [anchorId, movingId] = firstIndex < secondIndex
      ? [relationship.person1Id, relationship.person2Id]
      : [relationship.person2Id, relationship.person1Id];
    const anchorIndex = nextIds.indexOf(anchorId);
    const movingIndex = nextIds.indexOf(movingId);

    if (anchorIndex === -1 || movingIndex === -1) {
      continue;
    }

    nextIds.splice(movingIndex, 1);
    nextIds.splice(anchorIndex + 1, 0, movingId);
  }

  return nextIds;
}

function createPositionedNodes(
  graph: FamilyGraphResponse,
  personMap: Map<string, Person>,
  levels: Map<string, number>,
  levelOrder: Map<number, string[]>,
  relationshipsByPerson: Map<string, Relationship[]>,
): NetworkNode[] {
  const sortedLevels = [...levelOrder.keys()].sort((left, right) => left - right);
  const nodes: NetworkNode[] = [];
  const { branchKeys, branchMeta } = assignBranchKeys(graph, levels, relationshipsByPerson);
  const ancestorBranchKeys = sortBranchKeys(
    [...branchMeta.values()].filter((branch) => branch.kind === "up").map((branch) => branch.key),
    branchMeta,
    personMap,
  );
  const descendantBranchKeys = sortBranchKeys(
    [...branchMeta.values()].filter((branch) => branch.kind === "down").map((branch) => branch.key),
    branchMeta,
    personMap,
  );
  const ancestorWidths = measureBranchWidths(
    [...levelOrder.entries()].filter(([level]) => level < 0),
    branchKeys,
    relationshipsByPerson,
    levels,
  );
  const descendantWidths = measureBranchWidths(
    [...levelOrder.entries()].filter(([level]) => level > 0),
    branchKeys,
    relationshipsByPerson,
    levels,
  );
  const sameBandWidths = measureBranchWidths(
    [...levelOrder.entries()].filter(([level]) => level === 0),
    branchKeys,
    relationshipsByPerson,
    levels,
  );
  const ancestorCenters = buildCenteredBranchCenters(ancestorBranchKeys, ancestorWidths);
  const descendantCenters = buildCenteredBranchCenters(descendantBranchKeys, descendantWidths);
  const sameBandAncestorKeys = ancestorBranchKeys.filter((branchKey) => sameBandWidths.has(branchKey));
  const sameBandDescendantKeys = descendantBranchKeys.filter((branchKey) => sameBandWidths.has(branchKey));
  const sameBandCenters = buildSameBandCenters(
    sameBandAncestorKeys,
    sameBandDescendantKeys,
    sameBandWidths,
    sameBandWidths.get("focus") ?? nodeWidth,
  );

  for (const level of sortedLevels) {
    const ids = levelOrder.get(level) ?? [];
    const idsByBranch = groupIdsByBranch(ids, branchKeys);
    const branchCenters = level < 0
      ? ancestorCenters
      : level > 0
        ? descendantCenters
        : sameBandCenters;

    for (const [branchKey, branchIds] of idsByBranch.entries()) {
      const localCenters = calculateNodeCenters(branchIds, level, relationshipsByPerson, levels);
      const branchCenter = branchCenters.get(branchKey) ?? 0;

      branchIds.forEach((personId, index) => {
        const person = personMap.get(personId);

        if (!person) {
          return;
        }

        const cx = branchCenter + (localCenters[index] ?? 0);
        const cy = level * levelGap;
        const role: NetworkNodeRole = person.id === graph.focusPersonId
          ? "focus"
          : level < 0
            ? "ancestor"
            : level > 0
              ? "descendant"
              : "same";

        nodes.push({
          person,
          role,
          level,
          x: cx - nodeWidth / 2,
          y: cy - nodeHeight / 2,
          cx,
          cy,
          width: nodeWidth,
          height: nodeHeight,
        });
      });
    }
  }

  return nodes;
}

function createLegacyCompactPositionedNodes(
  graph: FamilyGraphResponse,
  personMap: Map<string, Person>,
  levels: Map<string, number>,
  levelOrder: Map<number, string[]>,
): NetworkNode[] {
  const sortedLevels = [...levelOrder.keys()].sort((left, right) => left - right);
  const nodes: NetworkNode[] = [];

  for (const level of sortedLevels) {
    const ids = levelOrder.get(level) ?? [];
    const totalWidth = (ids.length - 1) * horizontalGap;
    const startCx = -totalWidth / 2;

    ids.forEach((personId, index) => {
      const person = personMap.get(personId);

      if (!person) {
        return;
      }

      const cx = startCx + index * horizontalGap;
      const cy = level * levelGap;
      const role: NetworkNodeRole = person.id === graph.focusPersonId
        ? "focus"
        : level < 0
          ? "ancestor"
          : level > 0
            ? "descendant"
            : "same";

      nodes.push({
        person,
        role,
        level,
        x: cx - nodeWidth / 2,
        y: cy - nodeHeight / 2,
        cx,
        cy,
        width: nodeWidth,
        height: nodeHeight,
      });
    });
  }

  return nodes;
}

function assignBranchKeys(
  graph: FamilyGraphResponse,
  levels: Map<string, number>,
  relationshipsByPerson: Map<string, Relationship[]>,
): {
  branchKeys: Map<string, string>;
  branchMeta: Map<string, NetworkBranchMeta>;
} {
  const branchKeys = new Map<string, string>([[graph.focusPersonId, "focus"]]);
  const branchMeta = new Map<string, NetworkBranchMeta>([
    [
      "focus",
      {
        key: "focus",
        kind: "focus",
        rootPersonId: graph.focusPersonId,
      },
    ],
  ]);
  const queue = [graph.focusPersonId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (!currentId) {
      continue;
    }

    const currentBranchKey = branchKeys.get(currentId) ?? "focus";
    const currentLevel = levels.get(currentId) ?? 0;

    for (const relationship of relationshipsByPerson.get(currentId) ?? []) {
      const neighborId = relationship.person1Id === currentId ? relationship.person2Id : relationship.person1Id;

      if (branchKeys.has(neighborId)) {
        continue;
      }

      const neighborLevel = levels.get(neighborId) ?? currentLevel;
      const nextBranchKey = resolveBranchKey(currentId, currentBranchKey, currentLevel, neighborId, neighborLevel, relationship);

      branchKeys.set(neighborId, nextBranchKey);

      if (!branchMeta.has(nextBranchKey)) {
        branchMeta.set(nextBranchKey, {
          key: nextBranchKey,
          kind: neighborLevel < currentLevel ? "up" : "down",
          rootPersonId: neighborId,
        });
      }

      queue.push(neighborId);
    }
  }

  for (const person of graph.persons) {
    if (!branchKeys.has(person.id)) {
      branchKeys.set(person.id, "focus");
    }
  }

  return {
    branchKeys,
    branchMeta,
  };
}

function resolveBranchKey(
  currentId: string,
  currentBranchKey: string,
  currentLevel: number,
  neighborId: string,
  neighborLevel: number,
  relationship: Relationship,
): string {
  if (relationship.type === "spouse") {
    return currentBranchKey;
  }

  if (currentBranchKey === "focus") {
    if (neighborLevel < currentLevel) {
      return `up:${neighborId}`;
    }

    if (neighborLevel > currentLevel) {
      return `down:${neighborId}`;
    }
  }

  void currentId;

  return currentBranchKey;
}

function sortBranchKeys(
  branchKeys: string[],
  branchMeta: Map<string, NetworkBranchMeta>,
  personMap: Map<string, Person>,
): string[] {
  return [...new Set(branchKeys)].sort((left, right) => {
    const leftRootId = branchMeta.get(left)?.rootPersonId;
    const rightRootId = branchMeta.get(right)?.rootPersonId;
    const leftPerson = leftRootId ? personMap.get(leftRootId) : null;
    const rightPerson = rightRootId ? personMap.get(rightRootId) : null;

    if (leftPerson && rightPerson) {
      return comparePersons(leftPerson, rightPerson);
    }

    return left.localeCompare(right, "uk");
  });
}

function measureBranchWidths(
  entries: Array<[number, string[]]>,
  branchKeys: Map<string, string>,
  relationshipsByPerson: Map<string, Relationship[]>,
  levels: Map<string, number>,
): Map<string, number> {
  const widths = new Map<string, number>();

  for (const [level, ids] of entries) {
    const idsByBranch = groupIdsByBranch(ids, branchKeys);

    for (const [branchKey, branchIds] of idsByBranch.entries()) {
      const centers = calculateNodeCenters(branchIds, level, relationshipsByPerson, levels);
      const width = calculateSpanWidth(centers);
      widths.set(branchKey, Math.max(widths.get(branchKey) ?? 0, width));
    }
  }

  return widths;
}

function groupIdsByBranch(
  ids: string[],
  branchKeys: Map<string, string>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const personId of ids) {
    const branchKey = branchKeys.get(personId) ?? "focus";
    const values = result.get(branchKey) ?? [];
    values.push(personId);
    result.set(branchKey, values);
  }

  return result;
}

function calculateSpanWidth(centers: number[]): number {
  if (centers.length <= 1) {
    return nodeWidth;
  }

  return Math.max(...centers) - Math.min(...centers) + nodeWidth;
}

function buildCenteredBranchCenters(
  branchKeys: string[],
  widths: Map<string, number>,
): Map<string, number> {
  if (branchKeys.length === 0) {
    return new Map();
  }

  const placements: Array<[string, number]> = [];
  let cursor = 0;

  for (const branchKey of branchKeys) {
    const width = widths.get(branchKey) ?? nodeWidth;
    const center = cursor + width / 2;
    placements.push([branchKey, center]);
    cursor += width + majorBranchGap;
  }

  const totalWidth = cursor - majorBranchGap;
  const offset = totalWidth / 2;

  return new Map(placements.map(([branchKey, center]) => [branchKey, center - offset] as const));
}

function buildSameBandCenters(
  ancestorBranchKeys: string[],
  descendantBranchKeys: string[],
  widths: Map<string, number>,
  focusWidth: number,
): Map<string, number> {
  const result = new Map<string, number>([["focus", 0]]);
  let leftCursor = -(focusWidth / 2 + sameBandFocusGap);
  let rightCursor = focusWidth / 2 + sameBandFocusGap;

  for (const branchKey of [...ancestorBranchKeys].reverse()) {
    const width = widths.get(branchKey) ?? nodeWidth;
    result.set(branchKey, leftCursor - width / 2);
    leftCursor -= width + majorBranchGap;
  }

  for (const branchKey of descendantBranchKeys) {
    const width = widths.get(branchKey) ?? nodeWidth;
    result.set(branchKey, rightCursor + width / 2);
    rightCursor += width + majorBranchGap;
  }

  return result;
}

function calculateNodeCenters(
  ids: string[],
  level: number,
  relationshipsByPerson: Map<string, Relationship[]>,
  levels: Map<string, number>,
): number[] {
  if (ids.length === 0) {
    return [];
  }

  const rawCenters = [0];

  for (let index = 1; index < ids.length; index += 1) {
    const previousId = ids[index - 1];
    const currentId = ids[index];
    const nextCenter =
      rawCenters[index - 1]
      + resolveNodeGap(previousId, currentId, level, relationshipsByPerson, levels);

    rawCenters.push(nextCenter);
  }

  const minCenter = rawCenters[0] ?? 0;
  const maxCenter = rawCenters[rawCenters.length - 1] ?? 0;
  const offset = (minCenter + maxCenter) / 2;

  return rawCenters.map((center) => center - offset);
}

function resolveNodeGap(
  previousId: string,
  currentId: string,
  level: number,
  relationshipsByPerson: Map<string, Relationship[]>,
  levels: Map<string, number>,
): number {
  const previousCluster = buildBranchClusterKey(previousId, level, relationshipsByPerson, levels);
  const currentCluster = buildBranchClusterKey(currentId, level, relationshipsByPerson, levels);
  let gap = areSpousesOnSameLevel(previousId, currentId, level, relationshipsByPerson, levels)
    ? spousePairGap
    : horizontalGap;

  if (previousCluster && currentCluster && previousCluster !== currentCluster) {
    gap += branchClusterGap;
  } else if ((previousCluster && !currentCluster) || (!previousCluster && currentCluster)) {
    gap += Math.round(branchClusterGap * 0.45);
  }

  return gap;
}

function buildBranchClusterKey(
  personId: string,
  level: number,
  relationshipsByPerson: Map<string, Relationship[]>,
  levels: Map<string, number>,
): string | null {
  if (level > 0) {
    const parentIds = collectAdjacentIds(personId, level - 1, "parent_child", "person2Id", "person1Id", relationshipsByPerson, levels);

    if (parentIds.length > 0) {
      return `parents:${parentIds.join("|")}`;
    }
  }

  if (level < 0) {
    const childIds = collectAdjacentIds(personId, level + 1, "parent_child", "person1Id", "person2Id", relationshipsByPerson, levels);

    if (childIds.length > 0) {
      return `children:${childIds.join("|")}`;
    }
  }

  return null;
}

function collectAdjacentIds(
  personId: string,
  targetLevel: number,
  relationshipType: Relationship["type"],
  selfKey: "person1Id" | "person2Id",
  otherKey: "person1Id" | "person2Id",
  relationshipsByPerson: Map<string, Relationship[]>,
  levels: Map<string, number>,
): string[] {
  return [...new Set(
    (relationshipsByPerson.get(personId) ?? [])
      .filter((relationship) =>
        relationship.type === relationshipType
        && relationship[selfKey] === personId
        && (levels.get(relationship[otherKey]) ?? 0) === targetLevel,
      )
      .map((relationship) => relationship[otherKey]),
  )].sort((left, right) => left.localeCompare(right));
}

function areSpousesOnSameLevel(
  firstId: string,
  secondId: string,
  level: number,
  relationshipsByPerson: Map<string, Relationship[]>,
  levels: Map<string, number>,
): boolean {
  return (relationshipsByPerson.get(firstId) ?? []).some(
    (relationship) =>
      relationship.type === "spouse"
      && ((relationship.person1Id === firstId && relationship.person2Id === secondId)
        || (relationship.person1Id === secondId && relationship.person2Id === firstId))
      && (levels.get(relationship.person1Id) ?? 0) === level
      && (levels.get(relationship.person2Id) ?? 0) === level,
  );
}

function createBranchPath(parent: NetworkNode, child: NetworkNode): string {
  const sourceX = parent.cx;
  const sourceY = parent.y + parent.height;
  const targetX = child.cx;
  const targetY = child.y;
  const controlY = sourceY + (targetY - sourceY) / 2;

  return `M ${sourceX} ${sourceY} C ${sourceX} ${controlY}, ${targetX} ${controlY}, ${targetX} ${targetY}`;
}

function createSpousePath(first: NetworkNode, second: NetworkNode): string {
  const [left, right] = first.cx <= second.cx ? [first, second] : [second, first];
  const sourceX = left.x + left.width;
  const sourceY = left.cy;
  const targetX = right.x;
  const targetY = right.cy;
  const controlX = sourceX + (targetX - sourceX) / 2;

  return `M ${sourceX} ${sourceY} C ${controlX} ${sourceY}, ${controlX} ${targetY}, ${targetX} ${targetY}`;
}

function createNetworkLinkKey(
  kind: NetworkLink["kind"],
  relationship: Relationship,
  sourceRef: string,
  targetRef: string,
): string {
  return `${kind}:${relationship.id}:${sourceRef}:${targetRef}`;
}

function wrapLabel(value: string, limit: number, maxLines = 2): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [value];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > limit && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const visibleLines = lines.slice(0, maxLines);
  visibleLines[maxLines - 1] = truncate(visibleLines[maxLines - 1], limit - 1);
  return visibleLines;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, Math.max(1, limit - 1))}…` : value;
}

function comparePersons(left: Person, right: Person): number {
  const leftName = [left.lastName ?? "", left.firstName, left.middleName ?? ""].join(" ").trim();
  const rightName = [right.lastName ?? "", right.firstName, right.middleName ?? ""].join(" ").trim();
  return leftName.localeCompare(rightName, "uk");
}

function isNetworkNodeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".network-node-group") !== null;
}

function isNetworkLinkTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".network-link-group") !== null;
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
    return error.error?.error ?? "Не вдалося завантажити граф";
  }

  return "Не вдалося завантажити граф";
}
