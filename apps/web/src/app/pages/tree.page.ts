import type { Person, TreeResponse } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";

import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { PersonsService } from "../services/persons.service";
import { TreeService } from "../services/tree.service";
import { buildTreeDiagram, type TreeDiagram, type TreeDiagramNode } from "./tree-diagram";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ...MATERIAL_IMPORTS],
  template: `
    <section class="app-page page-stack">
      <mat-card class="diagram-card" *ngIf="diagram() as diagram; else emptyState">
        <div class="tree-toolbar">
          <form [formGroup]="controlsForm" (ngSubmit)="reload()" class="controls-panel">
            <mat-form-field appearance="outline" class="field-wide">
              <mat-label>Людина</mat-label>
              <mat-select id="personId" formControlName="personId">
                <mat-option value="">Оберіть людину</mat-option>
                <mat-option *ngFor="let person of persons()" [value]="person.id">
                  {{ displayName(person) }}
                </mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="field-compact">
              <mat-label>Вгору</mat-label>
              <input matInput id="up" type="number" min="0" max="5" formControlName="up">
            </mat-form-field>

            <mat-form-field appearance="outline" class="field-compact">
              <mat-label>Вниз</mat-label>
              <input matInput id="down" type="number" min="0" max="5" formControlName="down">
            </mat-form-field>

            <button mat-flat-button color="primary" type="submit" class="compact-button" [disabled]="isLoading() || controlsForm.invalid">
              {{ isLoading() ? "Оновлення..." : "Оновити" }}
            </button>
          </form>

          <mat-card appearance="outlined" class="toolbar-meta" *ngIf="rootPerson() as root">
            <div class="focus-inline">
              <mat-chip-set>
                <mat-chip>У фокусі</mat-chip>
              </mat-chip-set>
              <div class="focus-copy">
                <strong>{{ displayName(root) }}</strong>
                <span class="muted">{{ nodeMeta(root) }}</span>
              </div>
            </div>

            <div class="toolbar-actions">
              <a mat-stroked-button color="primary" [routerLink]="['/persons', root.id]" class="action-link">Профіль</a>
              <a mat-button routerLink="/persons/new" class="action-link">Додати</a>
            </div>
          </mat-card>
        </div>

        <mat-progress-bar *ngIf="isLoading()" mode="indeterminate"></mat-progress-bar>
        <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

        <div class="diagram-scroll">
          <svg
            class="tree-svg"
            [attr.viewBox]="diagram.viewBox"
            [attr.style]="'min-width:' + diagram.width + 'px; min-height:' + diagram.height + 'px;'"
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
              <text class="tree-node-title" x="18" y="46">{{ labelTop(node.person) }}</text>
              <text class="tree-node-meta" x="18" y="68">{{ labelBottom(node.person) }}</text>
            </g>
          </svg>
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

      .tree-toolbar {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
      }

      .controls-panel {
        display: grid;
        grid-template-columns: minmax(260px, 1.7fr) repeat(2, minmax(88px, 0.46fr)) auto;
        gap: 10px;
        align-items: end;
        flex: 1 1 720px;
      }

      .field-wide {
        min-width: 0;
      }

      .field-compact input {
        text-align: center;
      }

      .compact-button {
        min-height: 56px;
      }

      .toolbar-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 10px 14px;
      }

      .focus-inline {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .focus-copy {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .focus-copy strong {
        font-size: 15px;
      }

      .toolbar-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .action-link {
        text-decoration: none;
      }

      .diagram-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .diagram-scroll {
        overflow: auto;
        border-radius: 22px;
        border: 1px solid var(--border);
        min-height: calc(100vh - 255px);
        background:
          radial-gradient(circle at 20% 20%, rgba(117, 168, 232, 0.14), transparent 18%),
          radial-gradient(circle at 80% 14%, rgba(163, 200, 243, 0.16), transparent 16%),
          linear-gradient(180deg, rgba(246, 250, 255, 0.96), rgba(234, 242, 251, 0.96));
      }

      .tree-svg {
        display: block;
        width: 100%;
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

      @media (max-width: 980px) {
        .tree-toolbar {
          align-items: stretch;
        }

        .controls-panel {
          grid-template-columns: 1fr 1fr;
        }

        .toolbar-meta {
          justify-content: space-between;
        }
      }

      @media (max-width: 720px) {
        .controls-panel {
          grid-template-columns: 1fr;
        }

        .toolbar-meta {
          align-items: stretch;
          justify-content: flex-start;
        }

        .diagram-scroll {
          min-height: calc(100vh - 310px);
        }
      }
    `,
  ],
})
export class TreePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly treeService = inject(TreeService);
  private readonly personsService = inject(PersonsService);

  readonly errorMessage = signal("");
  readonly isLoading = signal(false);
  readonly tree = signal<TreeResponse | null>(null);
  readonly diagram = signal<TreeDiagram | null>(null);
  readonly rootPersonId = signal<string | null>(null);
  readonly persons = signal<Person[]>([]);

  readonly controlsForm = new FormGroup({
    personId: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    up: new FormControl(2, { nonNullable: true }),
    down: new FormControl(2, { nonNullable: true }),
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const personId = params.get("personId");

      if (personId) {
        this.rootPersonId.set(personId);
        this.controlsForm.controls.personId.setValue(personId, { emitEvent: false });
        void this.loadTree(personId);
        return;
      }

      this.rootPersonId.set(null);

      const firstPersonId = this.persons()[0]?.id ?? "";

      if (firstPersonId) {
        this.controlsForm.controls.personId.setValue(firstPersonId, { emitEvent: false });
        void this.loadTree(firstPersonId);
      }
    });

    void this.loadPersons();
  }

  rootPerson(): Person | undefined {
    const currentRootId = this.rootPersonId();
    const tree = this.tree();

    return (
      this.persons().find((person) => person.id === currentRootId) ??
      tree?.persons.find((person) => person.id === tree.rootPersonId)
    );
  }

  displayName(person: Person): string {
    return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
  }

  labelTop(person: Person): string {
    return truncate(this.displayName(person), 22);
  }

  labelBottom(person: Person): string {
    const labels = [person.birthDate, person.birthPlace, person.deathDate ? `† ${person.deathDate}` : null].filter(
      Boolean,
    );
    return truncate(labels.join(" • ") || "Дані не вказані", 34);
  }

  nodeMeta(person: Person): string {
    return [person.birthDate, person.birthPlace].filter(Boolean).join(" • ") || "Без додаткових дат і місць";
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

  async reload(): Promise<void> {
    const personId = this.controlsForm.controls.personId.value;

    if (!personId) {
      return;
    }

    await this.focusPerson(personId);
  }

  async focusPerson(personId: string): Promise<void> {
    if (personId === this.rootPersonId()) {
      await this.loadTree(personId);
      return;
    }

    await this.router.navigate(["/tree", personId]);
  }

  private async loadPersons(): Promise<void> {
    try {
      const persons = (await awaitOne<Person[]>(this.personsService.list())).sort((left, right) =>
        this.displayName(left).localeCompare(this.displayName(right), "uk"),
      );
      this.persons.set(persons);

      if (!this.rootPersonId() && persons[0]) {
        this.rootPersonId.set(persons[0].id);
        this.controlsForm.controls.personId.setValue(persons[0].id, { emitEvent: false });
        await this.loadTree(persons[0].id);
      }
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }

  private async loadTree(personId: string): Promise<void> {
    this.errorMessage.set("");
    this.isLoading.set(true);

    try {
      const { up, down } = this.controlsForm.getRawValue();
      const tree = await awaitOne<TreeResponse>(this.treeService.getTree(personId, up, down));
      this.rootPersonId.set(personId);
      this.tree.set(tree);
      this.diagram.set(buildTreeDiagram(tree));
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isLoading.set(false);
    }
  }
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Помилка запиту";
  }

  return "Помилка запиту";
}
