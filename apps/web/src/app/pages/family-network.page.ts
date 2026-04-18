import type { FamilyGraphResponse, Person, Relationship } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, ElementRef, ViewChild, effect, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";

import { PersonSidePanelComponent } from "../components/person-side-panel.component";
import { formatPersonDisplayName } from "../lib/person-name";
import { buildPhotoInitials, isSupportedPhotoUrl } from "../lib/photo";
import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { GraphService } from "../services/graph.service";
import { LoadingOverlayService } from "../services/loading-overlay.service";

const nodeWidth = 214;
const nodeHeight = 186;
const horizontalGap = 286;
const levelGap = 236;
const diagramPadding = 144;

type NetworkNodeRole = "focus" | "ancestor" | "descendant" | "same";

type NetworkNode = {
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
              <path
                class="network-link"
                [class.network-link--spouse]="link.kind === 'spouse'"
                [attr.d]="link.path"
              ></path>
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
                <clipPath [attr.id]="nodePhotoClipId(node.person.id)">
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
                  [attr.clip-path]="'url(#' + nodePhotoClipId(node.person.id) + ')'"
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
        stroke-width: 3;
        stroke: rgba(60, 101, 154, 0.24);
      }

      .network-link--spouse {
        stroke: rgba(80, 130, 196, 0.28);
        stroke-dasharray: 10 8;
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
  readonly selectedPersonPanel = signal<PersonPanelState | null>(null);
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

  nodePhotoClipId(personId: string): string {
    return `family-network-photo-${personId}`;
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

  closePersonPanel(): void {
    this.selectedPersonPanel.set(null);
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
    this.closePersonPanel();
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

    if (isNetworkNodeTarget(event.target)) {
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
    this.isLoading.set(true);
    this.errorMessage.set("");

    try {
      const graph = await awaitOne<FamilyGraphResponse>(this.graphService.getGraph(personId));
      const diagram = buildTreeLikeNetworkDiagram(graph);
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
    } catch (error) {
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
}

function buildTreeLikeNetworkDiagram(graph: FamilyGraphResponse): NetworkDiagram {
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
  const positionedNodes = createPositionedNodes(graph, levels, levelOrder);
  const nodeMap = new Map(positionedNodes.map((node) => [node.person.id, node] as const));
  const links = graph.relationships
    .map((relationship) => {
      const first = nodeMap.get(relationship.person1Id);
      const second = nodeMap.get(relationship.person2Id);

      if (!first || !second) {
        return null;
      }

      if (relationship.type === "spouse") {
        return {
          relationship,
          kind: "spouse" as const,
          path: createSpousePath(first, second),
        };
      }

      return {
        relationship,
        kind: "branch" as const,
        path: createBranchPath(first, second),
      };
    })
    .filter((link): link is NetworkLink => link !== null);

  const minX = Math.min(...positionedNodes.map((node) => node.x)) - diagramPadding;
  const minY = Math.min(...positionedNodes.map((node) => node.y)) - diagramPadding;
  const maxX = Math.max(...positionedNodes.map((node) => node.x + node.width)) + diagramPadding;
  const maxY = Math.max(...positionedNodes.map((node) => node.y + node.height)) + diagramPadding;
  const width = maxX - minX;
  const height = maxY - minY;

  void personMap;

  return {
    nodes: positionedNodes,
    links,
    width,
    height,
    viewBox: `${minX} ${minY} ${width} ${height}`,
  };
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
  levels: Map<string, number>,
  levelOrder: Map<number, string[]>,
): NetworkNode[] {
  const personMap = new Map(graph.persons.map((person) => [person.id, person] as const));
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
