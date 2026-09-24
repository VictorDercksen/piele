import { Injectable, computed, signal } from '@angular/core';
import { AuthChangeEvent, Session, SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Supabase Auth session for the browser. Google or email and password. The API verifies
 * the access token on every request; nothing here grants league access by itself.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** False when the build has no Supabase project, e.g. sample-data development. */
  readonly configured = !!environment.supabaseUrl && !!environment.supabasePublishableKey;
  private readonly client: SupabaseClient | null = this.configured
    ? createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  private readonly sessionState = signal<Session | null>(null);
  private readonly readyState = signal(!this.configured);
  readonly session = this.sessionState.asReadonly();
  /** True once the stored session has been read, so guards can decide. */
  readonly ready = this.readyState.asReadonly();
  readonly signedIn = computed(() => !!this.sessionState());
  readonly email = computed(() => this.sessionState()?.user.email ?? null);
  private readonly initial: Promise<void>;

  constructor() {
    if (!this.client) {
      this.initial = Promise.resolve();
      return;
    }
    const client = this.client;
    this.initial = client.auth
      .getSession()
      .then(({ data }) => this.sessionState.set(data.session))
      .catch(() => this.sessionState.set(null))
      .finally(() => this.readyState.set(true));
    client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      this.sessionState.set(session);
    });
  }

  /** Resolves when the stored session has been read. */
  whenReady(): Promise<void> {
    return this.initial;
  }

  /** The current access token, refreshed by the client when it is close to expiry. */
  async accessToken(): Promise<string | null> {
    if (!this.client) return null;
    await this.initial;
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async signInWithGoogle(returnTo: string): Promise<void> {
    const client = this.require();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/sign-in?returnUrl=${encodeURIComponent(returnTo)}` },
    });
    if (error) throw new Error(friendly(error.message));
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.require().auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendly(error.message));
  }

  /** Returns true when the account needs email confirmation before it can sign in. */
  async signUp(email: string, password: string): Promise<boolean> {
    const { data, error } = await this.require().auth.signUp({ email, password });
    if (error) throw new Error(friendly(error.message));
    return !data.session;
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.sessionState.set(null);
  }

  /** The Storage client for direct evidence uploads with an API-issued grant. */
  storage(): SupabaseClient['storage'] {
    return this.require().storage;
  }

  private require(): SupabaseClient {
    if (!this.client) throw new Error('Sign-in is not configured for this build.');
    return this.client;
  }
}

function friendly(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'That email and password do not match.';
  if (text.includes('email not confirmed')) return 'Confirm your email address first. Check your inbox.';
  if (text.includes('already registered')) return 'That email address already has an account. Sign in instead.';
  if (text.includes('password')) return 'Choose a password of at least 8 characters.';
  return 'Sign-in failed. Try again in a moment.';
}
