import { CommonModule } from "@angular/common";
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  computed,
  signal,
} from "@angular/core";

import { MATERIAL_IMPORTS } from "../material";

type Selection = {
  x: number;
  y: number;
  size: number;
};

type DisplayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type InteractionMode = "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se";

@Component({
  selector: "app-photo-crop-dialog",
  standalone: true,
  imports: [CommonModule, ...MATERIAL_IMPORTS],
  template: `
    <div class="photo-crop-overlay" (click)="cancel()">
      <section class="photo-crop-dialog" (click)="$event.stopPropagation()">
        <div class="photo-crop-header">
          <div>
            <h2>Налаштувати фото</h2>
            <p class="muted">Перетягніть квадрат, щоб вибрати кадр. Кути можна тягнути для зміни розміру.</p>
          </div>
        </div>

        <div class="photo-crop-layout">
          <div class="photo-crop-stage" #stageRef>
            <img
              *ngIf="previewUrl()"
              class="photo-crop-image"
              [src]="previewUrl()"
              [style]="imageStyle()"
              alt="Попередній перегляд фото"
              draggable="false"
            >

            <div
              *ngIf="previewUrl()"
              class="photo-crop-selection"
              [style]="selectionStyle()"
              (pointerdown)="startMove($event)"
            >
              <button
                type="button"
                class="photo-crop-handle photo-crop-handle--nw"
                (pointerdown)="startResize($event, 'resize-nw')"
                aria-label="Змінити розмір з верхнього лівого кута"
              ></button>
              <button
                type="button"
                class="photo-crop-handle photo-crop-handle--ne"
                (pointerdown)="startResize($event, 'resize-ne')"
                aria-label="Змінити розмір з верхнього правого кута"
              ></button>
              <button
                type="button"
                class="photo-crop-handle photo-crop-handle--sw"
                (pointerdown)="startResize($event, 'resize-sw')"
                aria-label="Змінити розмір з нижнього лівого кута"
              ></button>
              <button
                type="button"
                class="photo-crop-handle photo-crop-handle--se"
                (pointerdown)="startResize($event, 'resize-se')"
                aria-label="Змінити розмір з нижнього правого кута"
              ></button>
            </div>
          </div>

          <aside class="photo-crop-sidebar">
            <div class="photo-crop-preview">
              <span>Прев’ю</span>
              <div class="photo-crop-avatar">
                <img *ngIf="previewUrl()" class="photo-crop-avatar-image" [src]="previewUrl()" [style]="previewImageStyle()" alt="Прев’ю аватарки">
              </div>
            </div>
          </aside>
        </div>

        <div class="photo-crop-actions">
          <button mat-button type="button" (click)="cancel()">Скасувати</button>
          <button mat-flat-button color="primary" type="button" (click)="save()">Застосувати</button>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .photo-crop-overlay {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(10, 18, 29, 0.62);
        backdrop-filter: blur(6px);
      }

      .photo-crop-dialog {
        width: min(920px, 100%);
        max-height: min(92dvh, 860px);
        overflow: auto;
        padding: clamp(18px, 2.4vw, 24px);
        border-radius: 28px;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 250, 255, 0.98)),
          linear-gradient(135deg, rgba(222, 233, 248, 0.2), transparent 42%);
        box-shadow: 0 30px 80px rgba(7, 15, 24, 0.28);
      }

      .photo-crop-header {
        margin-bottom: 18px;
      }

      .photo-crop-header h2,
      .photo-crop-header p {
        margin: 0;
      }

      .photo-crop-header h2 {
        margin-bottom: 8px;
      }

      .photo-crop-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 148px;
        gap: 18px;
        align-items: start;
      }

      .photo-crop-stage {
        position: relative;
        width: 100%;
        height: min(54dvh, 460px);
        overflow: hidden;
        border-radius: 22px;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background:
          linear-gradient(180deg, rgba(239, 245, 252, 0.96), rgba(231, 239, 249, 0.96));
      }

      .photo-crop-image {
        position: absolute;
        user-select: none;
        -webkit-user-drag: none;
      }

      .photo-crop-selection {
        position: absolute;
        border: 1px dashed #ffffff;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.48);
        cursor: move;
      }

      .photo-crop-handle {
        position: absolute;
        width: 14px;
        height: 14px;
        padding: 0;
        border: 1px solid #ffffff;
        background: rgba(0, 0, 0, 0.76);
      }

      .photo-crop-handle--nw {
        top: -7px;
        left: -7px;
        cursor: nwse-resize;
      }

      .photo-crop-handle--ne {
        top: -7px;
        right: -7px;
        cursor: nesw-resize;
      }

      .photo-crop-handle--sw {
        bottom: -7px;
        left: -7px;
        cursor: nesw-resize;
      }

      .photo-crop-handle--se {
        right: -7px;
        bottom: -7px;
        cursor: nwse-resize;
      }

      .photo-crop-sidebar {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .photo-crop-preview {
        display: grid;
        gap: 10px;
      }

      .photo-crop-preview span {
        font-size: 13px;
        font-weight: 700;
        color: #3f5d80;
      }

      .photo-crop-avatar {
        position: relative;
        width: 112px;
        height: 112px;
        overflow: hidden;
        border-radius: 28px;
        border: 1px solid rgba(127, 160, 200, 0.18);
        background:
          linear-gradient(180deg, rgba(239, 245, 252, 0.96), rgba(231, 239, 249, 0.96));
      }

      .photo-crop-avatar-image {
        position: absolute;
      }

      .photo-crop-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 18px;
      }

      @media (max-width: 720px) {
        .photo-crop-overlay {
          padding: 12px;
        }

        .photo-crop-dialog {
          max-height: 96dvh;
          border-radius: 22px;
        }

        .photo-crop-layout {
          grid-template-columns: 1fr;
        }

        .photo-crop-stage {
          height: min(46dvh, 360px);
        }

        .photo-crop-sidebar {
          flex-direction: row;
          align-items: center;
        }

        .photo-crop-actions {
          flex-direction: column-reverse;
        }

        .photo-crop-actions > .mat-mdc-button-base {
          width: 100%;
          justify-content: center;
        }
      }
    `,
  ],
})
export class PhotoCropDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) file!: File;
  @Output() cancelCrop = new EventEmitter<void>();
  @Output() saveCrop = new EventEmitter<File>();

  @ViewChild("stageRef")
  private stageRef?: ElementRef<HTMLDivElement>;

  readonly outputSize = 512;
  readonly minSelectionSize = 72;
  readonly imageNaturalWidth = signal(0);
  readonly imageNaturalHeight = signal(0);
  readonly displayRect = signal<DisplayRect>({ x: 0, y: 0, width: 0, height: 0 });
  readonly selection = signal<Selection>({ x: 0, y: 0, size: 0 });
  readonly previewUrl = signal("");
  readonly imageStyle = computed(() => {
    const rect = this.displayRect();
    return `left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;`;
  });
  readonly selectionStyle = computed(() => {
    const rect = this.displayRect();
    const selection = this.selection();
    return `left:${rect.x + selection.x}px;top:${rect.y + selection.y}px;width:${selection.size}px;height:${selection.size}px;`;
  });
  readonly previewImageStyle = computed(() => {
    const rect = this.displayRect();
    const selection = this.selection();

    if (!selection.size || !rect.width || !rect.height) {
      return "";
    }

    const ratio = 112 / selection.size;
    const width = rect.width * ratio;
    const height = rect.height * ratio;
    const x = -selection.x * ratio;
    const y = -selection.y * ratio;
    return `left:${x}px;top:${y}px;width:${width}px;height:${height}px;`;
  });

  private interactionMode: InteractionMode | null = null;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private selectionStart: Selection = { x: 0, y: 0, size: 0 };
  private readonly onWindowPointerMove = (event: PointerEvent) => this.handlePointerMove(event);
  private readonly onWindowPointerUp = () => this.stopInteraction();

  ngOnInit(): void {
    const objectUrl = URL.createObjectURL(this.file);
    this.previewUrl.set(objectUrl);

    const image = new Image();
    image.onload = () => {
      this.imageNaturalWidth.set(image.naturalWidth);
      this.imageNaturalHeight.set(image.naturalHeight);
      this.recalculateDisplayRect();
      this.initializeSelection();
    };
    image.src = objectUrl;
  }

  ngAfterViewInit(): void {
    this.recalculateDisplayRect();
    this.initializeSelection();
  }

  ngOnDestroy(): void {
    this.stopInteraction();
    this.cleanupPreview();
  }

  @HostListener("window:resize")
  onStageResize(): void {
    this.recalculateDisplayRect();
    this.ensureSelectionInBounds();
  }

  cancel(): void {
    this.cancelCrop.emit();
  }

  startMove(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.beginInteraction(event, "move");
  }

  startResize(event: PointerEvent, mode: InteractionMode): void {
    event.preventDefault();
    event.stopPropagation();
    this.beginInteraction(event, mode);
  }

  async save(): Promise<void> {
    const cropped = await this.toCroppedFile();
    this.saveCrop.emit(cropped);
  }

  private cleanupPreview(): void {
    const url = this.previewUrl();

    if (!url) {
      return;
    }

    URL.revokeObjectURL(url);
    this.previewUrl.set("");
  }

  private async toCroppedFile(): Promise<File> {
    const image = await this.loadImage(this.previewUrl());
    const canvas = document.createElement("canvas");
    canvas.width = this.outputSize;
    canvas.height = this.outputSize;

    const context = canvas.getContext("2d");

    if (!context) {
      return this.file;
    }

    const rect = this.displayRect();
    const selection = this.selection();

    if (!rect.width || !rect.height || !selection.size) {
      return this.file;
    }

    const scale = this.imageNaturalWidth() / rect.width;
    const sourceX = selection.x * scale;
    const sourceY = selection.y * scale;
    const sourceSize = selection.size * scale;

    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, this.outputSize, this.outputSize);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92);
    });

    if (!blob) {
      return this.file;
    }

    const dotIndex = this.file.name.lastIndexOf(".");
    const baseName = dotIndex > 0 ? this.file.name.slice(0, dotIndex) : this.file.name;
    return new File([blob], `${baseName}-cropped.jpg`, { type: "image/jpeg" });
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Не вдалося завантажити фото для кадрування."));
      image.src = url;
    });
  }

  private beginInteraction(event: PointerEvent, mode: InteractionMode): void {
    this.interactionMode = mode;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.selectionStart = this.selection();
    window.addEventListener("pointermove", this.onWindowPointerMove);
    window.addEventListener("pointerup", this.onWindowPointerUp);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.interactionMode) {
      return;
    }

    const dx = event.clientX - this.pointerStartX;
    const dy = event.clientY - this.pointerStartY;

    if (this.interactionMode === "move") {
      this.applyMove(dx, dy);
      return;
    }

    this.applyResize(dx, dy, this.interactionMode);
  }

  private stopInteraction(): void {
    this.interactionMode = null;
    window.removeEventListener("pointermove", this.onWindowPointerMove);
    window.removeEventListener("pointerup", this.onWindowPointerUp);
  }

  private applyMove(dx: number, dy: number): void {
    const rect = this.displayRect();
    const start = this.selectionStart;
    const maxX = Math.max(0, rect.width - start.size);
    const maxY = Math.max(0, rect.height - start.size);

    this.selection.set({
      x: this.clamp(start.x + dx, 0, maxX),
      y: this.clamp(start.y + dy, 0, maxY),
      size: start.size,
    });
  }

  private applyResize(dx: number, dy: number, mode: InteractionMode): void {
    const rect = this.displayRect();
    const start = this.selectionStart;
    const right = start.x + start.size;
    const bottom = start.y + start.size;
    let nextSize = start.size;
    let nextX = start.x;
    let nextY = start.y;

    if (mode === "resize-se") {
      const max = Math.min(rect.width - start.x, rect.height - start.y);
      nextSize = this.clamp(start.size + Math.max(dx, dy), this.minSelectionSize, max);
    } else if (mode === "resize-nw") {
      const max = Math.min(right, bottom);
      nextSize = this.clamp(start.size - Math.max(dx, dy), this.minSelectionSize, max);
      nextX = right - nextSize;
      nextY = bottom - nextSize;
    } else if (mode === "resize-ne") {
      const max = Math.min(rect.width - start.x, bottom);
      nextSize = this.clamp(start.size + Math.max(dx, -dy), this.minSelectionSize, max);
      nextX = start.x;
      nextY = bottom - nextSize;
    } else if (mode === "resize-sw") {
      const max = Math.min(right, rect.height - start.y);
      nextSize = this.clamp(start.size + Math.max(-dx, dy), this.minSelectionSize, max);
      nextX = right - nextSize;
      nextY = start.y;
    }

    this.selection.set({
      x: this.clamp(nextX, 0, Math.max(0, rect.width - nextSize)),
      y: this.clamp(nextY, 0, Math.max(0, rect.height - nextSize)),
      size: nextSize,
    });
  }

  private recalculateDisplayRect(): void {
    const stageElement = this.stageRef?.nativeElement;

    if (!stageElement) {
      return;
    }

    const stageWidth = stageElement.clientWidth;
    const stageHeight = stageElement.clientHeight;
    const imageWidth = this.imageNaturalWidth();
    const imageHeight = this.imageNaturalHeight();

    if (!stageWidth || !stageHeight || !imageWidth || !imageHeight) {
      return;
    }

    const scale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    this.displayRect.set({
      x: (stageWidth - width) / 2,
      y: (stageHeight - height) / 2,
      width,
      height,
    });
  }

  private initializeSelection(): void {
    const rect = this.displayRect();

    if (!rect.width || !rect.height || this.selection().size > 0) {
      return;
    }

    const maxSize = Math.min(rect.width, rect.height);
    const size = Math.min(maxSize, Math.max(this.minSelectionSize, maxSize * 0.7));
    this.selection.set({
      x: (rect.width - size) / 2,
      y: (rect.height - size) / 2,
      size,
    });
  }

  private ensureSelectionInBounds(): void {
    const rect = this.displayRect();
    const current = this.selection();

    if (!rect.width || !rect.height || !current.size) {
      return;
    }

    const size = Math.min(current.size, rect.width, rect.height);
    this.selection.set({
      x: this.clamp(current.x, 0, Math.max(0, rect.width - size)),
      y: this.clamp(current.y, 0, Math.max(0, rect.height - size)),
      size,
    });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
