import type { Person, Relationship, TreeResponse } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";

import { awaitOne } from "../services/await-one";
import { TreeService } from "../services/tree.service";

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="app-page page-stack">
      <section class="card tree-controls">
        <div>
          <span class="chip">Дерево</span>
          <h1>Сімейне дерево</h1>
          <p class="muted">Центральна людина в центрі, предки зверху, нащадки знизу, партнери поруч.</p>
        </div>

        <form [formGroup]="controlsForm" (ngSubmit)="reload()" class="controls-form">
          <div class="field">
            <label for="up">Рівнів вгору</label>
            <input id="up" type="number" min="0" max="5" formControlName="up">
          </div>

          <div class="field">
            <label for="down">Рівнів вниз</label>
            <input id="down" type="number" min="0" max="5" formControlName="down">
          </div>

          <button type="submit" class="btn btn-primary">Оновити</button>
        </form>
      </section>

      <p class="error-text" *ngIf="errorMessage()">{{ errorMessage() }}</p>

      <section class="tree-layout" *ngIf="tree() as tree">
        <section class="card tree-layer">
          <div class="layer-header">
            <h2>Предки</h2>
          </div>

          <div *ngIf="ancestorLevels().length > 0; else noAncestors">
            <div class="generation-row" *ngFor="let generation of ancestorLevels()">
              <span class="generation-label">-{{ generation.depth }}</span>
              <div class="node-grid">
                <article class="tree-node" *ngFor="let person of generation.persons">
                  <a [routerLink]="['/persons', person.id]">{{ displayName(person) }}</a>
                  <p class="muted">{{ person.birthDate || "дата не вказана" }}</p>
                </article>
              </div>
            </div>
          </div>

          <ng-template #noAncestors>
            <div class="empty-state">Предки не знайдені для вибраної глибини.</div>
          </ng-template>
        </section>

        <section class="card tree-layer center-layer" *ngIf="rootPerson() as root">
          <div class="layer-header">
            <h2>Центр</h2>
          </div>

          <div class="center-row">
            <article class="tree-node tree-node-root">
              <span class="chip">Root</span>
              <a [routerLink]="['/persons', root.id]">{{ displayName(root) }}</a>
              <p class="muted">{{ root.birthPlace || "місце не вказано" }}</p>
            </article>

            <article class="tree-node" *ngFor="let spouse of spousePersons()">
              <span class="chip">Spouse</span>
              <a [routerLink]="['/persons', spouse.id]">{{ displayName(spouse) }}</a>
              <p class="muted">{{ spouse.birthPlace || "місце не вказано" }}</p>
            </article>
          </div>
        </section>

        <section class="card tree-layer">
          <div class="layer-header">
            <h2>Нащадки</h2>
          </div>

          <div *ngIf="descendantLevels().length > 0; else noDescendants">
            <div class="generation-row" *ngFor="let generation of descendantLevels()">
              <span class="generation-label">+{{ generation.depth }}</span>
              <div class="node-grid">
                <article class="tree-node" *ngFor="let person of generation.persons">
                  <a [routerLink]="['/persons', person.id]">{{ displayName(person) }}</a>
                  <p class="muted">{{ person.birthDate || "дата не вказана" }}</p>
                </article>
              </div>
            </div>
          </div>

          <ng-template #noDescendants>
            <div class="empty-state">Нащадки не знайдені для вибраної глибини.</div>
          </ng-template>
        </section>
      </section>
    </section>
  `,
  styles: [
    `
      .page-stack {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .tree-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 24px;
      }

      .tree-controls h1 {
        margin: 12px 0 8px;
      }

      .controls-form {
        display: grid;
        grid-template-columns: repeat(3, minmax(120px, 1fr));
        gap: 12px;
        align-items: end;
      }

      .tree-layout {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .tree-layer {
        padding: 24px;
      }

      .layer-header {
        margin-bottom: 16px;
      }

      .generation-row {
        display: grid;
        grid-template-columns: 54px 1fr;
        gap: 14px;
        align-items: start;
      }

      .generation-row + .generation-row {
        margin-top: 14px;
      }

      .generation-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 42px;
        border-radius: 14px;
        background: rgba(45, 34, 21, 0.08);
        color: var(--muted);
        font-weight: 700;
      }

      .node-grid,
      .center-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }

      .tree-node {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 18px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.74);
        border: 1px solid var(--border);
      }

      .tree-node-root {
        background: rgba(140, 79, 43, 0.12);
      }

      .tree-node a {
        font-size: 20px;
        font-weight: 700;
        text-decoration: none;
      }

      @media (max-width: 820px) {
        .tree-controls {
          flex-direction: column;
          align-items: stretch;
        }

        .controls-form {
          grid-template-columns: 1fr;
        }

        .generation-row {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class TreePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly treeService = inject(TreeService);

  readonly errorMessage = signal("");
  readonly tree = signal<TreeResponse | null>(null);
  readonly rootPersonId = signal<string | null>(null);

  readonly controlsForm = new FormGroup({
    up: new FormControl(2, { nonNullable: true }),
    down: new FormControl(2, { nonNullable: true }),
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const personId = params.get("personId");

      if (personId) {
        this.rootPersonId.set(personId);
        void this.loadTree(personId);
      }
    });
  }

  rootPerson(): Person | undefined {
    const tree = this.tree();
    return tree?.persons.find((person) => person.id === tree.rootPersonId);
  }

  spousePersons(): Person[] {
    const tree = this.tree();

    if (!tree) {
      return [];
    }

    const spouseIds = tree.relationships
      .filter(
        (relationship) =>
          relationship.type === "spouse" &&
          (relationship.person1Id === tree.rootPersonId || relationship.person2Id === tree.rootPersonId),
      )
      .map((relationship) =>
        relationship.person1Id === tree.rootPersonId ? relationship.person2Id : relationship.person1Id,
      );

    return tree.persons.filter((person) => spouseIds.includes(person.id));
  }

  ancestorLevels(): GenerationLevel[] {
    return buildGenerationLevels(this.tree(), "ancestors");
  }

  descendantLevels(): GenerationLevel[] {
    return buildGenerationLevels(this.tree(), "descendants");
  }

  displayName(person: Person): string {
    return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
  }

  async reload(): Promise<void> {
    const personId = this.rootPersonId();

    if (!personId) {
      return;
    }

    await this.loadTree(personId);
  }

  private async loadTree(personId: string): Promise<void> {
    this.errorMessage.set("");

    try {
      const { up, down } = this.controlsForm.getRawValue();
      const tree = await awaitOne<TreeResponse>(this.treeService.getTree(personId, up, down));
      this.tree.set(tree);
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    }
  }
}

type GenerationDirection = "ancestors" | "descendants";

interface GenerationLevel {
  depth: number;
  persons: Person[];
}

function buildGenerationLevels(tree: TreeResponse | null, direction: GenerationDirection): GenerationLevel[] {
  if (!tree) {
    return [];
  }

  const personMap = new Map(tree.persons.map((person) => [person.id, person] as const));
  const queue: Array<{ id: string; depth: number }> = [{ id: tree.rootPersonId, depth: 0 }];
  const visited = new Set<string>([tree.rootPersonId]);
  const grouped = new Map<number, Person[]>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const matches = tree.relationships.filter((relationship) => {
      if (relationship.type !== "parent_child") {
        return false;
      }

      if (direction === "ancestors") {
        return relationship.person2Id === current.id;
      }

      return relationship.person1Id === current.id;
    });

    for (const relationship of matches) {
      const nextId = direction === "ancestors" ? relationship.person1Id : relationship.person2Id;

      if (visited.has(nextId)) {
        continue;
      }

      visited.add(nextId);
      const person = personMap.get(nextId);

      if (!person) {
        continue;
      }

      const nextDepth = current.depth + 1;
      const group = grouped.get(nextDepth) ?? [];
      group.push(person);
      grouped.set(nextDepth, group);
      queue.push({ id: nextId, depth: nextDepth });
    }
  }

  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([depth, persons]) => ({ depth, persons }));
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Помилка запиту";
  }

  return "Помилка запиту";
}
