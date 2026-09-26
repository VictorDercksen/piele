import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../../core/feedback/toast.service';
import { LeagueContext } from '../../../core/league/league-context';
import { DEFAULT_ACCENT, isAccentColour } from '../../../core/league/emblems';
import { AppearanceChange } from '../../../core/league/league.models';
import { prepareEmblem } from '../../../core/profile/profile-photo';
import { EmblemPicker } from '../../../shared/emblem-picker/emblem-picker';
import { LeagueCrest } from '../../../shared/league-crest/league-crest';
import { Loader } from '../../../shared/loader/loader';

/**
 * The captain's desk card for how the league looks: a preset crest or an uploaded image
 * (cropped to 512 px in the browser, uploaded with an API grant), removing the emblem, and the
 * accent colour that tints the preset crests and the monogram. Changes wait for "Save".
 */
@Component({
  selector: 'app-appearance-card',
  templateUrl: './appearance-card.html',
  styleUrl: './appearance-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmblemPicker, LeagueCrest, Loader],
})
export class AppearanceCard {
  private readonly context = inject(LeagueContext);
  private readonly toast = inject(ToastService);
  readonly league = this.context.current;
  /** The emblem the steward picked but has not saved; undefined keeps the saved one. */
  private readonly emblem = signal<AppearanceChange['emblem']>(undefined);
  /** The accent colour picked but not saved; undefined keeps the saved one, null the default. */
  private readonly accent = signal<string | null | undefined>(undefined);
  readonly preparing = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  /** How the league will look once saved. */
  readonly preview = computed(() => {
    const league = this.league();
    const emblem = this.emblem();
    const accent = this.accent();
    return {
      name: league?.name ?? '',
      slug: league?.slug ?? '',
      emblemPreset:
        emblem === undefined
          ? (league?.emblemPreset ?? null)
          : emblem && 'preset' in emblem
            ? emblem.preset
            : null,
      emblemUrl:
        emblem === undefined
          ? (league?.emblemUrl ?? null)
          : emblem && 'image' in emblem
            ? emblem.image
            : null,
      accentColour: accent === undefined ? (league?.accentColour ?? null) : accent,
    };
  });
  readonly hasEmblem = computed(() => !!this.preview().emblemPreset || !!this.preview().emblemUrl);
  readonly accentValue = computed(() => this.preview().accentColour ?? DEFAULT_ACCENT);
  readonly changed = computed(() => this.emblem() !== undefined || this.accent() !== undefined);
  readonly busy = computed(() => this.preparing() || this.saving());

  choosePreset(key: string): void {
    this.error.set('');
    this.emblem.set({ preset: key });
  }

  async chooseFile(event: Event): Promise<void> {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    if (!input || !file) return;
    this.preparing.set(true);
    this.error.set('');
    try {
      this.emblem.set({ image: await prepareEmblem(file) });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'This image could not be used.');
    } finally {
      this.preparing.set(false);
      input.value = '';
    }
  }

  removeEmblem(): void {
    this.error.set('');
    this.emblem.set(null);
  }

  chooseAccent(event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value.toLowerCase() : '';
    if (isAccentColour(value)) this.accent.set(value);
  }

  defaultAccent(): void {
    this.accent.set(null);
  }

  discard(): void {
    this.emblem.set(undefined);
    this.accent.set(undefined);
    this.error.set('');
  }

  async save(): Promise<void> {
    if (!this.changed() || this.busy()) return;
    const league = this.league();
    const accent = this.accent();
    const change: AppearanceChange = {
      ...(this.emblem() !== undefined ? { emblem: this.emblem() } : {}),
      ...(accent !== undefined && accent !== (league?.accentColour ?? null)
        ? { accentColour: accent }
        : {}),
    };
    this.saving.set(true);
    this.error.set('');
    try {
      if (change.emblem !== undefined || change.accentColour !== undefined)
        await this.context.saveAppearance(change);
      this.discard();
      this.toast.show(`${league?.name ?? 'The league'} has its new look.`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The appearance could not be saved.');
    } finally {
      this.saving.set(false);
    }
  }
}
