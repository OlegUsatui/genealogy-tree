import type { Person, PublicFamilyTreeResponse, PublicSelfAddResponse, TreeResponse } from "@family-tree/shared";

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, DestroyRef, ElementRef, ViewChild, effect, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { MatSnackBar } from "@angular/material/snack-bar";

import { formatPersonDisplayName } from "../lib/person-name";
import { buildPhotoInitials, isSupportedPhotoUrl } from "../lib/photo";
import { MATERIAL_IMPORTS } from "../material";
import { awaitOne } from "../services/await-one";
import { FamilySpacesService } from "../services/family-spaces.service";
import { LoadingOverlayService } from "../services/loading-overlay.service";
import { buildFamilyNetworkDiagram, type FamilyNetworkDiagram, type FamilyNetworkNode } from "./family-network-diagram";

type LivingOption = "unknown" | "true" | "false";
type PublicRelationKind = "parent" | "child" | "spouse" | "sibling";
type PublicQuickAddAction = "father" | "mother" | "brother" | "sister" | "son" | "daughter";
type QuickAddMenuState = {
  person: Person;
  centerX: number;
  centerY: number;
};

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ...MATERIAL_IMPORTS],
  template: `
    <section class="tree-page">
      <div class="tree-hud tree-hud--public" *ngIf="isLoading() || errorMessage() || (familyTitle() && isBannerVisible())">
        <div class="family-banner" *ngIf="familyTitle() && isBannerVisible()">
          <div class="family-banner-copy">
            <strong class="family-banner-title">Огляд сімʼї</strong>
            <p class="muted">Щоб додати родича, натисніть на потрібну людину в схемі.</p>
          </div>

          <button type="button" class="family-banner-close" aria-label="Закрити банер" (click)="closeBanner()">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <mat-progress-bar *ngIf="isLoading()" mode="indeterminate"></mat-progress-bar>
        <p class="error-text tree-error" *ngIf="errorMessage()">{{ errorMessage() }}</p>
      </div>

      <div class="quick-add-overlay" *ngIf="quickAddMenu()" (click)="closeQuickAddMenu()"></div>
      <div
        class="quick-add-menu"
        *ngIf="quickAddMenu() as menu"
        [style.left.px]="menu.centerX"
        [style.top.px]="menu.centerY"
        (click)="$event.stopPropagation()"
      >
        <button type="button" class="quick-add-option quick-add-option--top-left" (click)="chooseQuickAddAction('father')">
          Додати батька
        </button>
        <button type="button" class="quick-add-option quick-add-option--top-right" (click)="chooseQuickAddAction('mother')">
          Додати матір
        </button>
        <button type="button" class="quick-add-option quick-add-option--left" (click)="chooseQuickAddAction('sister')">
          Додати сестру
        </button>
        <button type="button" class="quick-add-option quick-add-option--right" (click)="chooseQuickAddAction('brother')">
          Додати брата
        </button>
        <button type="button" class="quick-add-option quick-add-option--bottom-left" (click)="chooseQuickAddAction('son')">
          Додати сина
        </button>
        <button type="button" class="quick-add-option quick-add-option--bottom-right" (click)="chooseQuickAddAction('daughter')">
          Додати дочку
        </button>

        <div class="quick-add-target-card">
          <div class="quick-add-target-photo-shell">
            <img *ngIf="renderablePhotoUrl(menu.person); else quickAddPhotoFallback" [src]="renderablePhotoUrl(menu.person)!" alt="Фото людини" class="quick-add-target-photo">
            <ng-template #quickAddPhotoFallback>
              <div class="quick-add-target-photo-fallback">{{ photoInitials(menu.person) }}</div>
            </ng-template>
          </div>
          <strong>{{ displayName(menu.person) }}</strong>
        </div>
      </div>

      <div class="public-join-overlay" *ngIf="isJoinPanelOpen()" (click)="closeJoinPanel()">
        <section class="public-join-card" (click)="$event.stopPropagation()">
          <div class="public-join-header" *ngIf="selectedRelatedPerson() as related">
            <div>
              <span class="public-join-kicker">Додати родича</span>
              <h2>{{ quickAddHeading(related) }}</h2>
              <p class="muted">
                {{ quickAddDescription(related) }}
              </p>
            </div>

            <button mat-stroked-button type="button" (click)="closeJoinPanel()">Закрити</button>
          </div>

          <form [formGroup]="joinForm" (ngSubmit)="submitJoin()" class="public-join-form">
            <div class="field-grid">
              <mat-form-field appearance="outline">
                <mat-label>Ім’я</mat-label>
                <input matInput formControlName="firstName">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Прізвище</mat-label>
                <input matInput formControlName="lastName">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>По батькові / друге ім’я</mat-label>
                <input matInput formControlName="middleName">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Дівоче прізвище</mat-label>
                <input matInput formControlName="maidenName">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Дата народження</mat-label>
                <input matInput type="date" formControlName="birthDate">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Місце народження</mat-label>
                <input matInput formControlName="birthPlace">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Статус життя</mat-label>
                <mat-select formControlName="isLiving">
                  <mat-option value="true">живий / жива</mat-option>
                  <mat-option value="false">помер / померла</mat-option>
                  <mat-option value="unknown">не вказано</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <div class="selected-match" *ngIf="selectedExistingCandidate() as selected">
              <div class="selected-match-copy">
                <span class="selected-match-eyebrow">Ця людина вже є в цій мережі родини</span>
                <strong>{{ displayName(selected) }}</strong>
                <span class="muted">Ми використаємо цей профіль і просто додамо правильний зв’язок, без створення дубля.</span>
              </div>

              <button mat-stroked-button type="button" (click)="clearExistingSelection()">Обрати іншу людину</button>
            </div>

            <div class="match-panel" *ngIf="showSelfMatchesPanel()">
              <div class="match-panel-copy">
                <h3>{{ selfMatchPanelTitle() }}</h3>
                <p class="muted">{{ selfMatchPanelDescription() }}</p>
              </div>

              <div class="match-options" *ngIf="selfMatches().length > 0">
                <button
                  *ngFor="let candidate of selfMatches()"
                  type="button"
                  class="match-option"
                  [class.match-option--exact]="isExactSelfMatch(candidate)"
                  (click)="selectExistingCandidate(candidate)"
                >
                  <div class="match-option-copy">
                    <div class="match-option-title-row">
                      <span class="match-option-title">{{ displayName(candidate) }}</span>
                      <span class="match-badge" *ngIf="isExactSelfMatch(candidate)">Точний збіг</span>
                    </div>
                    <span class="match-option-meta">{{ candidateMeta(candidate) }}</span>
                  </div>
                  <span class="match-option-action">Обрати</span>
                </button>
              </div>
            </div>

            <ng-container *ngIf="!selectedExistingCandidate() && selectedRelatedPerson() as related">
              <div class="relation-panel">
                <div class="match-panel-copy">
                  <h3>{{ quickAddSummaryTitle() }}</h3>
                  <p class="muted">{{ quickAddSummaryDescription(related) }}</p>
                </div>

                <div class="selected-relative">
                  <span class="muted">Родича буде додано до:</span>
                  <strong>{{ displayName(related) }}</strong>
                </div>
              </div>
            </ng-container>

            <p class="error-text" *ngIf="joinErrorMessage()">{{ joinErrorMessage() }}</p>

            <div class="public-join-actions">
              <button mat-stroked-button type="button" (click)="closeJoinPanel()">Скасувати</button>
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="isSubmitting() || joinForm.invalid"
              >
                {{ isSubmitting() ? "Збереження..." : joinSubmitLabel() }}
              </button>
            </div>
          </form>
        </section>
      </div>

      <ng-container *ngIf="diagram() as diagram; else emptyState">
        <div
          #viewport
          class="diagram-scroll"
          [class.diagram-scroll--with-banner]="familyTitle() && isBannerVisible()"
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
                [class.ancestor-node]="node.role === 'ancestor'"
                [class.descendant-node]="node.role === 'descendant'"
                [class.spouse-node]="node.role === 'same'"
                [class.node-highlighted]="highlightedPersonId() === node.person.id"
                [attr.transform]="'translate(' + node.x + ',' + node.y + ')'"
                (click)="openQuickAddMenu(node.person, $event)"
              >
                <rect class="tree-node-card" [attr.width]="node.width" [attr.height]="node.height" rx="24" ry="24"></rect>
                <text class="tree-node-badge" [attr.x]="node.width / 2" y="22" text-anchor="middle">
                  {{ nodeGenerationLabel(node) }}
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
                <text class="tree-node-title" [attr.x]="node.width / 2" y="102" text-anchor="middle">
                  <tspan
                    *ngFor="let line of titleLines(node.person); let index = index"
                    [attr.x]="node.width / 2"
                    [attr.dy]="index === 0 ? 0 : 18"
                  >
                    {{ line }}
                  </tspan>
                </text>
                <text class="tree-node-meta" [attr.x]="node.width / 2" y="156" text-anchor="middle">
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
      </ng-container>

      <ng-template #emptyState>
        <section class="tree-page tree-page--empty" *ngIf="hasCompletedInitialFamilyLoad() && !isLoading() && !errorMessage()">
          <div class="empty-state tree-empty-state">Немає достатньо даних для побудови мережі родини.</div>
        </section>
      </ng-template>
    </section>
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

      @keyframes overlay-fade-in {
        from {
          opacity: 0;
        }

        to {
          opacity: 1;
        }
      }

      @keyframes surface-pop-in {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.96);
        }

        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes card-pop-in {
        from {
          opacity: 0;
          transform: translateY(16px) scale(0.96);
        }

        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
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

      .tree-hud--public > * {
        pointer-events: auto;
      }

      .family-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 22px;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 255, 0.96)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.16), transparent 42%);
        box-shadow: 0 18px 40px rgba(31, 53, 79, 0.14);
        animation: surface-pop-in 220ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .family-banner-copy {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }

      .family-banner-copy h1 {
        margin: 0;
        font-size: clamp(28px, 4vw, 36px);
      }

      .family-banner-title {
        font-size: 17px;
        font-weight: 700;
        color: #234261;
      }

      .family-banner-copy p {
        margin: 0;
        max-width: 760px;
      }

      .family-banner-close {
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

      .family-banner-close:hover {
        border-color: rgba(53, 95, 83, 0.28);
        background: rgba(255, 255, 255, 0.98);
        transform: translateY(-1px);
      }

      .family-banner-close span {
        display: block;
        font-size: 22px;
        line-height: 1;
      }

      .family-banner-kicker,
      .public-join-kicker,
      .selected-match-eyebrow {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #3c6b5f;
      }

      .family-banner-actions {
        display: flex;
        align-items: center;
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

      .quick-add-overlay {
        position: fixed;
        inset: 0;
        z-index: 7;
        background: rgba(16, 26, 34, 0.42);
        backdrop-filter: blur(4px);
        animation: overlay-fade-in 160ms ease-out;
      }

      .quick-add-menu {
        position: fixed;
        z-index: 8;
        width: 0;
        height: 0;
      }

      .quick-add-option,
      .quick-add-target-card {
        position: absolute;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.16), transparent 42%);
        box-shadow: 0 18px 40px rgba(31, 53, 79, 0.18);
        transform-origin: center center;
      }

      .quick-add-option {
        min-width: 154px;
        padding: 11px 14px;
        border-radius: 16px;
        color: var(--text);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        transition: transform 140ms ease, border-color 140ms ease, background-color 140ms ease;
        animation: surface-pop-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .quick-add-option:hover {
        transform: translateY(-1px);
        border-color: rgba(53, 95, 83, 0.28);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(250, 252, 255, 0.99)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.18), transparent 42%);
      }

      .quick-add-option--top-left {
        animation-delay: 10ms;
        left: -166px;
        top: -206px;
      }

      .quick-add-option--top-right {
        animation-delay: 30ms;
        left: 12px;
        top: -206px;
      }

      .quick-add-option--left {
        animation-delay: 50ms;
        left: -232px;
        top: -24px;
      }

      .quick-add-option--right {
        animation-delay: 70ms;
        left: 96px;
        top: -24px;
      }

      .quick-add-option--bottom-left {
        animation-delay: 90ms;
        left: -166px;
        top: 150px;
      }

      .quick-add-option--bottom-right {
        animation-delay: 110ms;
        left: 12px;
        top: 150px;
      }

      .quick-add-target-card {
        left: -70px;
        top: -56px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        width: 140px;
        padding: 16px 14px;
        border-radius: 22px;
        text-align: center;
        animation: card-pop-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .quick-add-target-photo-shell {
        width: 72px;
        height: 72px;
        overflow: hidden;
        border-radius: 22px;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background: linear-gradient(180deg, rgba(233, 241, 251, 0.92), rgba(219, 233, 248, 0.92));
      }

      .quick-add-target-photo,
      .quick-add-target-photo-fallback {
        width: 100%;
        height: 100%;
      }

      .quick-add-target-photo {
        display: block;
        object-fit: cover;
      }

      .quick-add-target-photo-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 26px;
        font-weight: 800;
        color: #234261;
      }

      .public-join-overlay {
        position: fixed;
        inset: 0;
        z-index: 8;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(16, 26, 34, 0.38);
        backdrop-filter: blur(8px);
        animation: overlay-fade-in 180ms ease-out;
      }

      .public-join-card {
        width: min(860px, 100%);
        max-height: calc(100dvh - 40px);
        overflow: auto;
        padding: 22px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 24px 56px rgba(19, 34, 43, 0.22);
        animation: card-pop-in 220ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .public-join-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 20px;
      }

      .public-join-header h2 {
        margin: 4px 0 8px;
      }

      .public-join-header p {
        margin: 0;
      }

      .public-join-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .selected-match,
      .relation-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px 18px;
        border-radius: 18px;
        background: rgba(247, 251, 250, 0.94);
        border: 1px solid rgba(96, 114, 123, 0.14);
      }

      .selected-match {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        background: linear-gradient(180deg, rgba(225, 244, 240, 0.85), rgba(237, 247, 244, 0.94));
        border-color: rgba(93, 131, 120, 0.22);
      }

      .selected-match-copy {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .match-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 18px;
        border-radius: 18px;
        background: rgba(247, 251, 250, 0.94);
        border: 1px solid rgba(96, 114, 123, 0.14);
      }

      .match-panel-copy h3 {
        margin: 0 0 6px;
      }

      .match-panel-copy p {
        margin: 0;
      }

      .match-options {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .match-option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        width: 100%;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid rgba(96, 114, 123, 0.16);
        background: #fff;
        text-align: left;
        cursor: pointer;
      }

      .match-option--exact {
        border-color: rgba(53, 95, 83, 0.36);
        background: linear-gradient(180deg, rgba(234, 247, 243, 0.96), rgba(250, 252, 251, 0.98));
      }

      .match-option-copy {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .match-option-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .match-option-title,
      .candidate-title {
        font-weight: 700;
        color: var(--text);
      }

      .match-option-meta,
      .candidate-meta {
        font-size: 13px;
        color: var(--muted-foreground);
      }

      .candidate-option {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-block: 4px;
      }

      .match-option-action {
        font-size: 13px;
        font-weight: 700;
        color: #335e53;
        white-space: nowrap;
      }

      .match-badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(63, 112, 99, 0.12);
        color: #355f53;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .selected-relative {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .public-join-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
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

      .diagram-scroll--with-banner {
        padding-top: 108px;
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

      .tree-node-card {
        stroke: rgba(66, 108, 161, 0.16);
        stroke-width: 1.5;
        filter: url(#nodeShadow);
      }

      .tree-node-group {
        cursor: pointer;
      }

      .tree-node-group:hover .tree-node-card {
        stroke: rgba(31, 103, 198, 0.42);
      }

      @media (prefers-reduced-motion: reduce) {
        .family-banner,
        .quick-add-overlay,
        .quick-add-option,
        .quick-add-target-card,
        .public-join-overlay,
        .public-join-card {
          animation: none !important;
        }

        .quick-add-option,
        .family-banner-close {
          transition: none !important;
        }
      }

      .node-highlighted .tree-node-card {
        stroke: rgba(31, 103, 198, 0.5);
        stroke-width: 2;
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

      .tree-node-group:not(.ancestor-node):not(.descendant-node):not(.spouse-node) .tree-node-card {
        fill: rgba(236, 244, 255, 0.98);
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

      @media (max-width: 900px) {
        .family-banner,
        .public-join-header,
        .selected-match {
          flex-direction: column;
          align-items: stretch;
        }
      }

      @media (max-width: 760px) {
        .quick-add-menu {
          left: 50% !important;
          top: 50% !important;
          transform: translate(-50%, -50%);
          width: min(360px, calc(100vw - 28px));
          height: auto;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .quick-add-option--top-left,
        .quick-add-option--top-right,
        .quick-add-option--left,
        .quick-add-option--right,
        .quick-add-option--bottom-left,
        .quick-add-option--bottom-right {
          position: static;
          left: auto;
          top: auto;
          min-width: 0;
          width: 100%;
          animation-delay: 0ms;
        }

        .quick-add-target-card {
          position: static;
          left: auto;
          top: auto;
          width: 100%;
          grid-column: 1 / -1;
        }

        .field-grid {
          grid-template-columns: 1fr;
        }

        .match-option,
        .public-join-actions {
          flex-direction: column;
          align-items: stretch;
        }
      }

      @media (max-width: 720px) {
        .tree-page,
        .diagram-scroll {
          min-height: calc(100dvh - 146px);
        }

        .diagram-scroll--with-banner {
          padding-top: 124px;
        }

        .diagram-canvas {
          min-height: calc(100dvh - 146px);
        }

        .tree-hud {
          top: 14px;
          left: 14px;
          right: 14px;
        }

        .diagram-scroll::before {
          background-size: auto calc(100% - 16px);
        }
      }
    `,
  ],
})
export class FamilyPublicPageComponent {
  @ViewChild("viewport")
  private viewportRef?: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly familySpacesService = inject(FamilySpacesService);
  private readonly loadingOverlay = inject(LoadingOverlayService);
  private readonly snackBar = inject(MatSnackBar);

  readonly isLoading = signal(true);
  readonly hasCompletedInitialFamilyLoad = signal(false);
  readonly errorMessage = signal("");
  readonly family = signal<PublicFamilyTreeResponse | null>(null);
  readonly diagram = signal<FamilyNetworkDiagram | null>(null);
  readonly familyTitle = signal("");
  readonly highlightedPersonId = signal<string | null>(null);
  readonly isBannerVisible = signal(true);
  readonly quickAddMenu = signal<QuickAddMenuState | null>(null);
  readonly isJoinPanelOpen = signal(false);
  readonly isSubmitting = signal(false);
  readonly joinErrorMessage = signal("");
  readonly selectedExistingCandidate = signal<Person | null>(null);
  readonly selectedRelatedPerson = signal<Person | null>(null);
  readonly selectedQuickAddAction = signal<PublicQuickAddAction | null>(null);
  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly isPanning = signal(false);
  readonly minZoom = 0.4;
  readonly maxZoom = 10;

  readonly joinForm = new FormGroup({
    firstName: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    lastName: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    middleName: new FormControl("", { nonNullable: true }),
    maidenName: new FormControl("", { nonNullable: true }),
    birthDate: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    birthPlace: new FormControl("", { nonNullable: true }),
    isLiving: new FormControl<LivingOption>("true", { nonNullable: true }),
    relationKind: new FormControl<PublicRelationKind>("child", { nonNullable: true }),
    relatedToQuery: new FormControl<string | Person>("", { nonNullable: true }),
  });

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

  constructor() {
    effect(
      () => {
        if (this.isLoading()) {
          this.loadingOverlay.show("family-public-page");
        } else {
          this.loadingOverlay.hide("family-public-page");
        }
      },
      { allowSignalWrites: true },
    );

    this.destroyRef.onDestroy(() => {
      this.loadingOverlay.hide("family-public-page");
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const token = params.get("token");

      if (!token) {
        this.errorMessage.set("Посилання на мережу родини некоректне");
        this.isLoading.set(false);
        this.hasCompletedInitialFamilyLoad.set(true);
        return;
      }

      void this.loadFamily(token);
    });

    this.joinForm.controls.firstName.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.onIdentityFieldsChanged();
    });
    this.joinForm.controls.lastName.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.onIdentityFieldsChanged();
    });
    this.joinForm.controls.birthDate.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.onIdentityFieldsChanged();
    });
    this.joinForm.controls.relatedToQuery.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (typeof value === "string") {
        this.selectedRelatedPerson.set(null);
      }
    });
  }

  displayName(person: Person): string {
    return formatPersonDisplayName(person);
  }

  sceneTransform(): string {
    return `translate3d(${this.panX()}px, ${this.panY()}px, 0) scale(${this.zoom()})`;
  }

  titleLines(person: Person): string[] {
    return wrapNodeTitle(this.displayName(person), 16, 3);
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
    return `public-tree-node-photo-${personId}`;
  }

  nodeGenerationLabel(node: FamilyNetworkNode): string {
    return `ПОКОЛІННЯ ${toRomanNumeral(this.generationNumber(node))}`;
  }

  generationNumber(node: FamilyNetworkNode): number {
    const diagram = this.diagram();

    if (!diagram || diagram.nodes.length === 0) {
      return 1;
    }

    const minLevel = Math.min(...diagram.nodes.map((candidate) => candidate.level));
    return node.level - minLevel + 1;
  }

  quickAddHeading(related: Person): string {
    switch (this.selectedQuickAddAction()) {
      case "father":
        return `Додати батька до ${this.displayName(related)}`;
      case "mother":
        return `Додати матір до ${this.displayName(related)}`;
      case "brother":
        return `Додати брата для ${this.displayName(related)}`;
      case "sister":
        return `Додати сестру для ${this.displayName(related)}`;
      case "son":
        return `Додати сина до ${this.displayName(related)}`;
      case "daughter":
        return `Додати дочку до ${this.displayName(related)}`;
      default:
        return `Додати родича до ${this.displayName(related)}`;
    }
  }

  quickAddDescription(related: Person): string {
    switch (this.selectedQuickAddAction()) {
      case "father":
      case "mother":
        return `Введіть дані одного з батьків для ${this.displayName(related)}. Якщо ця людина вже є в мережі, оберіть її зі списку.`;
      case "brother":
      case "sister":
        return `Введіть дані брата або сестри для ${this.displayName(related)}. Якщо ця людина вже є в мережі, оберіть її зі списку.`;
      case "son":
      case "daughter":
        return `Введіть дані дитини для ${this.displayName(related)}. Якщо ця людина вже є в мережі, оберіть її зі списку.`;
      default:
        return `Введіть дані родича для ${this.displayName(related)}.`;
    }
  }

  quickAddSummaryTitle(): string {
    switch (this.selectedQuickAddAction()) {
      case "father":
        return "Буде додано батька";
      case "mother":
        return "Буде додано матір";
      case "brother":
        return "Буде додано брата";
      case "sister":
        return "Буде додано сестру";
      case "son":
        return "Буде додано сина";
      case "daughter":
        return "Буде додано дочку";
      default:
        return "Буде додано родича";
    }
  }

  quickAddSummaryDescription(related: Person): string {
    switch (this.selectedQuickAddAction()) {
      case "father":
      case "mother":
        return `Після збереження ця людина стане одним із батьків для ${this.displayName(related)}.`;
      case "brother":
      case "sister":
        return `Після збереження ця людина буде повʼязана з ${this.displayName(related)} як брат або сестра через спільних батьків.`;
      case "son":
      case "daughter":
        return `Після збереження ця людина стане дитиною для ${this.displayName(related)}.`;
      default:
        return `Після збереження родича буде додано до ${this.displayName(related)}.`;
    }
  }

  candidateMeta(person: Person): string {
    const details = [person.birthDate, person.birthPlace].filter(Boolean);
    return details.length > 0 ? details.join(" • ") : "Дата та місто народження не вказані";
  }

  closeBanner(): void {
    this.isBannerVisible.set(false);
  }

  openQuickAddMenu(person: Person, event: MouseEvent): void {
    event?.stopPropagation();
    this.highlightedPersonId.set(person.id);
    const currentTarget = event.currentTarget;

    if (!(currentTarget instanceof SVGGraphicsElement)) {
      return;
    }

    const rect = currentTarget.getBoundingClientRect();
    this.quickAddMenu.set({
      person,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    });
  }

  closeQuickAddMenu(): void {
    this.quickAddMenu.set(null);
  }

  closeJoinPanel(): void {
    this.isJoinPanelOpen.set(false);
    this.joinErrorMessage.set("");
    this.selectedExistingCandidate.set(null);
    this.selectedRelatedPerson.set(null);
    this.selectedQuickAddAction.set(null);
    this.joinForm.controls.relatedToQuery.setValue("", { emitEvent: false });
  }

  chooseQuickAddAction(action: PublicQuickAddAction): void {
    const menu = this.quickAddMenu();

    if (!menu) {
      return;
    }

    if ((action === "brother" || action === "sister") && !this.canAddSibling(menu.person.id)) {
      this.snackBar.open("Щоб додати брата або сестру, спочатку додайте хоча б одного з батьків цієї людини.", "Закрити", {
        duration: 3400,
      });
      this.closeQuickAddMenu();
      return;
    }

    this.selectedQuickAddAction.set(action);
    this.selectedExistingCandidate.set(null);
    this.selectedRelatedPerson.set(menu.person);
    this.joinErrorMessage.set("");
    this.joinForm.reset(
      {
        firstName: "",
        lastName: "",
        middleName: "",
        maidenName: "",
        birthDate: "",
        birthPlace: "",
        isLiving: "true",
        relationKind: relationKindForQuickAddAction(action),
        relatedToQuery: menu.person,
      },
      { emitEvent: false },
    );
    this.closeQuickAddMenu();
    this.isJoinPanelOpen.set(true);
  }

  selectExistingCandidate(candidate: Person): void {
    this.selectedExistingCandidate.set(candidate);
    this.joinForm.patchValue(
      {
        firstName: candidate.firstName,
        lastName: candidate.lastName ?? "",
        middleName: candidate.middleName ?? "",
        maidenName: candidate.maidenName ?? "",
        birthDate: candidate.birthDate ?? "",
        birthPlace: candidate.birthPlace ?? "",
        isLiving: candidate.isLiving === null ? "unknown" : candidate.isLiving ? "true" : "false",
      },
      { emitEvent: false },
    );
    this.joinErrorMessage.set("");
  }

  clearExistingSelection(): void {
    this.selectedExistingCandidate.set(null);
    this.joinErrorMessage.set("");
  }

  selfMatches(): Person[] {
    const persons = this.family()?.tree.persons ?? [];
    const selectedTargetId = this.selectedRelatedPerson()?.id;
    const firstName = normalizeIdentityValue(this.joinForm.controls.firstName.value);
    const lastName = normalizeIdentityValue(this.joinForm.controls.lastName.value);
    const birthDate = this.joinForm.controls.birthDate.value.trim();

    if (firstName.length < 2 || lastName.length < 2) {
      return [];
    }

    const exact: Person[] = [];
    const similar: Person[] = [];

    for (const person of persons) {
      if (person.id === selectedTargetId) {
        continue;
      }

      const personFirstName = normalizeIdentityValue(person.firstName);
      const personLastName = normalizeIdentityValue(person.lastName);
      const isNameMatch = personFirstName.includes(firstName) && personLastName.includes(lastName);

      if (!isNameMatch) {
        continue;
      }

      if (birthDate && person.birthDate === birthDate && personFirstName === firstName && personLastName === lastName) {
        exact.push(person);
      } else {
        similar.push(person);
      }
    }

    return [...exact, ...similar].slice(0, 8);
  }

  showSelfMatchesPanel(): boolean {
    return this.selectedExistingCandidate() === null && this.selfMatches().length > 0;
  }

  selfMatchPanelTitle(): string {
    return this.selfMatches().some((candidate) => this.isExactSelfMatch(candidate))
      ? "Схоже, ця людина вже є в цій мережі родини"
      : "Можливі збіги";
  }

  selfMatchPanelDescription(): string {
    return this.selfMatches().some((candidate) => this.isExactSelfMatch(candidate))
      ? "Оберіть профіль зі списку, і ми просто використаємо його без створення дубля."
      : "Якщо бачите потрібну людину, оберіть її профіль. Якщо ні, продовжуйте додавання як нової людини.";
  }

  canAddSibling(personId: string): boolean {
    return (this.family()?.tree.relationships ?? []).some(
      (relationship) => relationship.type === "parent_child" && relationship.person2Id === personId,
    );
  }

  isExactSelfMatch(candidate: Person): boolean {
    const birthDate = this.joinForm.controls.birthDate.value.trim();

    if (!birthDate || !candidate.birthDate) {
      return false;
    }

    return (
      normalizeIdentityValue(candidate.firstName) === normalizeIdentityValue(this.joinForm.controls.firstName.value) &&
      normalizeIdentityValue(candidate.lastName) === normalizeIdentityValue(this.joinForm.controls.lastName.value) &&
      candidate.birthDate === birthDate
    );
  }

  relationTargetMatches(): Person[] {
    const persons = this.family()?.tree.persons ?? [];
    const value = this.joinForm.controls.relatedToQuery.value;
    const query = typeof value === "string" ? normalizeIdentityValue(value) : "";

    if (!query) {
      return persons.slice(0, 12);
    }

    return persons.filter((person) => {
      const haystack = [
        person.firstName,
        person.lastName ?? "",
        person.middleName ?? "",
        person.maidenName ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("uk-UA");
      return haystack.includes(query);
    }).slice(0, 12);
  }

  displayRelatedPerson = (person: Person | string | null): string => {
    if (!person) {
      return "";
    }

    return typeof person === "string" ? person : this.displayName(person);
  };

  selectRelatedPerson(person: Person): void {
    this.selectedRelatedPerson.set(person);
    this.joinForm.controls.relatedToQuery.setValue(person, { emitEvent: false });
  }

  joinSubmitLabel(): string {
    return this.selectedExistingCandidate() ? "Додати наявного родича" : "Додати родича";
  }

  async submitJoin(): Promise<void> {
    if (this.joinForm.invalid) {
      this.joinForm.markAllAsTouched();
      return;
    }

    const token = this.family()?.token;

    if (!token) {
      return;
    }

    const exactMatchExists = this.selfMatches().some((candidate) => this.isExactSelfMatch(candidate));

    if (exactMatchExists && !this.selectedExistingCandidate()) {
      this.joinErrorMessage.set("Така людина вже є в цій мережі родини. Оберіть її профіль зі списку, щоб не створювати дубль.");
      return;
    }

    if (!this.selectedExistingCandidate() && !this.selectedRelatedPerson()) {
      this.joinErrorMessage.set("Спочатку натисніть на людину в схемі, до якої потрібно додати родича.");
      return;
    }

    this.isSubmitting.set(true);
    this.joinErrorMessage.set("");

    try {
      const response = await awaitOne<PublicSelfAddResponse>(
        this.familySpacesService.addSelf(token, this.buildJoinPayload()),
      );

      await this.loadFamily(token, response.person.id);
      this.closeJoinPanel();

      if (response.usedExistingPerson && response.relationship) {
        this.snackBar.open("Знайшли наявний профіль і додали зв’язок у мережі родини.", "Закрити", { duration: 3200 });
      } else if (response.alreadyInTree) {
        this.snackBar.open("Ця людина вже є в цій мережі родини. Показую її профіль у схемі.", "Закрити", { duration: 3000 });
      } else {
        this.snackBar.open("Людину додано до мережі родини.", "Закрити", { duration: 3000 });
      }
    } catch (error) {
      const apiError = error as HttpErrorResponse;
      const duplicatePersonId = apiError.error?.details?.personId;

      if (duplicatePersonId && typeof duplicatePersonId === "string") {
        this.highlightedPersonId.set(duplicatePersonId);
      }

      this.joinErrorMessage.set(readApiError(error));
    } finally {
      this.isSubmitting.set(false);
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
      }
    }

    if (!this.panState || event.pointerId !== this.panState.pointerId) {
      return;
    }

    const viewport = event.currentTarget;
    const { pointerId } = this.panState;

    if (viewport instanceof HTMLElement && viewport.hasPointerCapture(pointerId)) {
      viewport.releasePointerCapture(pointerId);
    }

    this.panState = null;
    this.isPanning.set(false);
  }

  private buildJoinPayload() {
    const selectedExistingCandidate = this.selectedExistingCandidate();
    const related = this.selectedRelatedPerson();
    const action = this.selectedQuickAddAction();

    if (selectedExistingCandidate) {
      return {
        existingPersonId: selectedExistingCandidate.id,
        relatedToPersonId: related?.id ?? null,
        relationKind: action ? relationKindForQuickAddAction(action) : this.joinForm.controls.relationKind.value,
      };
    }

    return {
      relatedToPersonId: related?.id ?? null,
      relationKind: action ? relationKindForQuickAddAction(action) : this.joinForm.controls.relationKind.value,
      person: {
        firstName: this.joinForm.controls.firstName.value.trim(),
        lastName: this.joinForm.controls.lastName.value.trim(),
        middleName: emptyToNull(this.joinForm.controls.middleName.value),
        maidenName: emptyToNull(this.joinForm.controls.maidenName.value),
        gender: genderForQuickAddAction(action),
        birthDate: this.joinForm.controls.birthDate.value.trim(),
        birthPlace: emptyToNull(this.joinForm.controls.birthPlace.value),
        isLiving: parseLivingValue(this.joinForm.controls.isLiving.value),
      },
    };
  }

  private onIdentityFieldsChanged(): void {
    this.joinErrorMessage.set("");

    if (this.selectedExistingCandidate()) {
      this.selectedExistingCandidate.set(null);
    }
  }

  private async loadFamily(token: string, focusPersonId?: string): Promise<void> {
    this.errorMessage.set("");
    this.isLoading.set(true);

    try {
      const family = await awaitOne<PublicFamilyTreeResponse>(this.familySpacesService.getPublicFamily(token));
      const diagram = buildFamilyNetworkDiagram(family.tree);
      this.family.set(family);
      this.familyTitle.set(family.title);
      this.diagram.set(diagram);
      const targetPersonId = focusPersonId ?? family.rootPersonId;
      window.requestAnimationFrame(() => {
        this.fitDiagramToViewport(diagram);
        window.requestAnimationFrame(() => {
          this.centerPerson(diagram, targetPersonId);
        });
      });
    } catch (error) {
      this.errorMessage.set(readApiError(error));
    } finally {
      this.isLoading.set(false);
      this.hasCompletedInitialFamilyLoad.set(true);
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

  private fitDiagramToViewport(diagram: FamilyNetworkDiagram): void {
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

  private centerPerson(diagram: FamilyNetworkDiagram, personId: string): void {
    const viewport = this.viewportRef?.nativeElement;
    const node = diagram.nodes.find((candidate) => candidate.person.id === personId);

    if (!viewport || !node) {
      return;
    }

    const [minX, minY] = parseViewBoxOrigin(diagram.viewBox);
    const zoom = this.zoom();
    const nodeCenterX = (node.x + node.width / 2 - minX) * zoom;
    const nodeCenterY = (node.y + node.height / 2 - minY) * zoom;

    this.panX.set(viewport.clientWidth / 2 - nodeCenterX);
    this.panY.set(viewport.clientHeight / 2 - nodeCenterY);
    this.highlightedPersonId.set(personId);
  }
}

function emptyToNull(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseLivingValue(value: LivingOption): boolean | null {
  if (value === "unknown") {
    return null;
  }

  return value === "true";
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function wrapNodeTitle(value: string, limit = 18, maxLines = 2): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return ["Без імені"];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const rawWord of words) {
    const word = fitWord(rawWord, limit);

    if (!currentLine) {
      currentLine = word;
      continue;
    }

    const candidate = `${currentLine} ${word}`;

    if (candidate.length > limit) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    currentLine = candidate;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const visibleLines = lines.slice(0, maxLines);
  visibleLines[maxLines - 1] = truncate(lines.slice(maxLines - 1).join(" "), limit);
  return visibleLines;
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

function isTreeNodeTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".tree-node-group") !== null;
}

function relationKindForQuickAddAction(action: PublicQuickAddAction): PublicRelationKind | "sibling" {
  switch (action) {
    case "father":
    case "mother":
      return "parent";
    case "brother":
    case "sister":
      return "sibling";
    case "son":
    case "daughter":
      return "child";
  }
}

function genderForQuickAddAction(action: PublicQuickAddAction | null): Person["gender"] {
  switch (action) {
    case "father":
    case "brother":
    case "son":
      return "male";
    case "mother":
    case "sister":
    case "daughter":
      return "female";
    default:
      return "unknown";
  }
}

function toRomanNumeral(value: number): string {
  const romanParts: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];

  let remaining = Math.max(1, Math.floor(value));
  let result = "";

  for (const [arabic, roman] of romanParts) {
    while (remaining >= arabic) {
      result += roman;
      remaining -= arabic;
    }
  }

  return result;
}

function normalizeIdentityValue(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase("uk-UA") ?? "";
}

function readApiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error ?? "Помилка запиту";
  }

  return "Помилка запиту";
}
