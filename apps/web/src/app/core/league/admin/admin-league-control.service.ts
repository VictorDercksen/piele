import { Service, inject } from '@angular/core';
import { LeagueContext } from '../league-context';
import { AdminData } from './admin-data';
import { AdminLeague, LeagueUpdate, NewLeague } from './admin.models';

/**
 * The admin's changes to leagues. After each change the account is read again, so the league
 * switcher follows at once.
 */
@Service()
export class AdminLeagueControlService {
  private readonly data = inject(AdminData);
  private readonly context = inject(LeagueContext);

  /** Creates a league in one request; resolves once the switcher lists it. */
  async create(body: NewLeague): Promise<AdminLeague> {
    return this.refreshed(await this.data.create(body));
  }

  /** Renames the league, changes its time zone or rules, or archives or restores it. */
  async update(id: string, patch: LeagueUpdate): Promise<AdminLeague> {
    return this.refreshed(await this.data.update(id, patch));
  }

  /** Makes an active, claimed member the league's captain. */
  async appointCaptain(id: string, memberId: string): Promise<AdminLeague> {
    return this.refreshed(await this.data.appointCaptain(id, memberId));
  }

  /**
   * Adds the admin to the league outside the season, under `name` or the API's default (the
   * admin's name in another league, else "Admin"). Resolves to the membership id.
   */
  async addMe(id: string, name?: string): Promise<string> {
    return this.refreshed(await this.data.addMe(id, name));
  }

  /** Has the account read again, then passes the result on. */
  private async refreshed<T>(result: T): Promise<T> {
    await this.context.refreshAccount();
    return result;
  }
}
