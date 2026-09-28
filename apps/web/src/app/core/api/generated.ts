// Generated from the Python API OpenAPI schema. Run npm run generate:api.
export interface paths {
    readonly "/v1/admin/leagues": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /**
         * List Leagues
         * @description Every league, archived included: active first, then by name.
         */
        readonly get: operations["list_leagues_v1_admin_leagues_get"];
        readonly put?: never;
        /** Create League */
        readonly post: operations["create_league_v1_admin_leagues_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/admin/leagues/{leagueId}": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        /**
         * Update League
         * @description Renames the league, changes its time zone, archives or restores it, or changes its
         *     Superbru rules.
         */
        readonly patch: operations["update_league_v1_admin_leagues__leagueId__patch"];
        readonly trace?: never;
    };
    readonly "/v1/admin/leagues/{leagueId}/captain": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Appoint Captain
         * @description Makes an active, claimed member the captain.
         */
        readonly post: operations["appoint_captain_v1_admin_leagues__leagueId__captain_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/admin/leagues/{leagueId}/members/me": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Add Me
         * @description Adds the admin as a member outside the season: 201 when new, 200 when the admin was
         *     already a member (a withdrawn membership is reinstated, still out of season).
         */
        readonly post: operations["add_me_v1_admin_leagues__leagueId__members_me_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/agent/dispatches": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Dispatch
         * @description Claim up to DISPATCH_LIMIT due fixtures of the competition, soonest kickoff first, for
         *     writing sessions.
         *
         *     With a fixtureId, only that fixture is considered; with force as well, it is claimed even
         *     when it has a preview, is inside a lease or has used its attempts.
         */
        readonly post: operations["dispatch_v1_agent_dispatches_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/agent/fixtures/{fixture_id}/state": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Fixture State */
        readonly get: operations["fixture_state_v1_agent_fixtures__fixture_id__state_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/agent/fixtures/due": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Due */
        readonly get: operations["due_v1_agent_fixtures_due_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/agent/previews": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /** Save Preview */
        readonly post: operations["save_preview_v1_agent_previews_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/competitions": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /**
         * List Competitions
         * @description The competitions a league can play (the registry), for the management centre's form.
         *     Any signed-in account may read it.
         */
        readonly get: operations["list_competitions_v1_competitions_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/competitions/{competitionId}/matches/{fixture_id}": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Match Centre */
        readonly get: operations["match_centre_v1_competitions__competitionId__matches__fixture_id__get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/competitions/{competitionId}/matches/{fixture_id}/preview": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /**
         * Match Preview
         * @description The latest Pavilion preview for members. Written by the preview agent before kickoff.
         */
        readonly get: operations["match_preview_v1_competitions__competitionId__matches__fixture_id__preview_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/competitions/{competitionId}/rounds/{round_number}/scores": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Round Scores */
        readonly get: operations["round_scores_v1_competitions__competitionId__rounds__round_number__scores_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/competitions/{competitionId}/rounds/{round_number}/updates": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /**
         * Round Updates
         * @description The round's teamsheets, previews, kick-offs and full-time results for the notifications
         *     panel. Members of a league on this competition (or the admin) only, because it reports
         *     the Pavilion previews. The member is resolved inside the handler, with the same rule as
         *     `competition_member_dependency`, so no transaction is open while the match centre uses
         *     the pool.
         */
        readonly get: operations["round_updates_v1_competitions__competitionId__rounds__round_number__updates_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/health": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Health */
        readonly get: operations["health_v1_health_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/join/{code}": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Join Invitation */
        readonly get: operations["join_invitation_v1_join__code__get"];
        readonly put?: never;
        /**
         * Join
         * @description Claims one name in the league the code opens and returns the caller's view of it.
         */
        readonly post: operations["join_v1_join__code__post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/appearance": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        /**
         * Update Appearance
         * @description Sets the league's emblem (a preset or an upload) and accent colour.
         */
        readonly put: operations["update_appearance_v1_leagues__leagueId__appearance_put"];
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/duties": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** List Duties */
        readonly get: operations["list_duties_v1_leagues__leagueId__duties_get"];
        readonly put?: never;
        /** Create Duty */
        readonly post: operations["create_duty_v1_leagues__leagueId__duties_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/duties/{duty_id}/reset-clock": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Reset Duty Clock
         * @description Records a challenge resolved in the member's favour: the overdue clock restarts now.
         */
        readonly post: operations["reset_duty_clock_v1_leagues__leagueId__duties__duty_id__reset_clock_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/duties/{duty_id}/void": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /** Void Duty */
        readonly post: operations["void_duty_v1_leagues__leagueId__duties__duty_id__void_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/duties/default-deadline": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Duty Default Deadline */
        readonly get: operations["duty_default_deadline_v1_leagues__leagueId__duties_default_deadline_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/emblem/uploads": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Reserve Emblem Upload
         * @description A signed upload to emblems/<league id>/ in the private bucket; save it with
         *     PUT /appearance once the upload finishes.
         */
        readonly post: operations["reserve_emblem_upload_v1_leagues__leagueId__emblem_uploads_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/evidence": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /** Submit Evidence */
        readonly post: operations["submit_evidence_v1_leagues__leagueId__evidence_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/evidence/assets/{asset_id}/playback": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Playback */
        readonly get: operations["playback_v1_leagues__leagueId__evidence_assets__asset_id__playback_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/evidence/cases": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /**
         * List Cases
         * @description The active season's evidence cases, newest first; one round's with `round`. Cases
         *     whose window has closed are settled first.
         */
        readonly get: operations["list_cases_v1_leagues__leagueId__evidence_cases_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/evidence/cases/{case_id}/response": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Respond To Case
         * @description An eligible voter accepts or vetoes while voting is open: 403 `not_a_voter`, 409
         *     `voting_closed`, 409 `veto_final` (a veto cannot be changed). A veto sends the case to
         *     review; the accept that makes a majority accepts the evidence.
         */
        readonly post: operations["respond_to_case_v1_leagues__leagueId__evidence_cases__case_id__response_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/evidence/cases/{case_id}/review": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Review Case
         * @description Rules on the pending veto: 409 `not_in_review`, 403 `not_reviewer` for anyone but the
         *     uninvolved captain, the stand-in when the captain is involved, or the admin. Upheld
         *     rejects the evidence; dismissed reopens voting on the original timer.
         */
        readonly post: operations["review_case_v1_leagues__leagueId__evidence_cases__case_id__review_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/evidence/links/{link_id}/decision": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Decide
         * @description The captain's (or admin's) override: decides the evidence at any time and closes its
         *     case with resolution `captain`. 403 `self_review` for the captain's own evidence.
         */
        readonly post: operations["decide_v1_leagues__leagueId__evidence_links__link_id__decision_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/evidence/uploads": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /** Reserve Upload */
        readonly post: operations["reserve_upload_v1_leagues__leagueId__evidence_uploads_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/feed": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Feed */
        readonly get: operations["feed_v1_leagues__leagueId__feed_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/join-code": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        readonly post?: never;
        /**
         * Close Join Code
         * @description Closes the league to joining by code.
         */
        readonly delete: operations["close_join_code_v1_leagues__leagueId__join_code_delete"];
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/join-code/rotate": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Rotate Join Code
         * @description A new join code; the old one stops working. Also reopens joining after a close.
         */
        readonly post: operations["rotate_join_code_v1_leagues__leagueId__join_code_rotate_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/marks": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Marks */
        readonly get: operations["marks_v1_leagues__leagueId__marks_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/matches/{fixture_id}/picks": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        /**
         * Record Picks
         * @description Captain or admin records or corrects members' picks at any time; members left out keep
         *     theirs.
         */
        readonly put: operations["record_picks_v1_leagues__leagueId__matches__fixture_id__picks_put"];
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/matches/{fixture_id}/picks/{member_id}": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        readonly post?: never;
        /**
         * Delete Pick
         * @description Captain or admin removes a member's pick.
         */
        readonly delete: operations["delete_pick_v1_leagues__leagueId__matches__fixture_id__picks__member_id__delete"];
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/matches/{fixture_id}/picks/me": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        /**
         * Save Own Pick
         * @description The caller's own pick, until kickoff (422 `picks_locked` after).
         */
        readonly put: operations["save_own_pick_v1_leagues__leagueId__matches__fixture_id__picks_me_put"];
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/me": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Me */
        readonly get: operations["me_v1_leagues__leagueId__me_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/me/last": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        /**
         * Record Last League
         * @description Remembers this league as the one the account opened last.
         */
        readonly put: operations["record_last_league_v1_leagues__leagueId__me_last_put"];
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/me/notifications": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        /**
         * Update Notifications
         * @description Saves what the caller has read in this league's notifications panel and returns the
         *     merged state.
         */
        readonly put: operations["update_notifications_v1_leagues__leagueId__me_notifications_put"];
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/me/photo/uploads": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Reserve Photo Upload
         * @description The photo is account-wide (avatars/<user id>/); the route sits under the league so
         *     the client has one base URL.
         */
        readonly post: operations["reserve_photo_upload_v1_leagues__leagueId__me_photo_uploads_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/me/profile": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        /**
         * Update Profile
         * @description Saves the caller's favourite team in this league and their photo. Nobody can change
         *     another member's profile.
         */
        readonly put: operations["update_profile_v1_leagues__leagueId__me_profile_put"];
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/members": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /**
         * List Members
         * @description The team sheet. `?include=withdrawn` adds removed members for the captain and the
         *     admin; everyone else gets active members whatever they ask for.
         */
        readonly get: operations["list_members_v1_leagues__leagueId__members_get"];
        readonly put?: never;
        /** Add Member */
        readonly post: operations["add_member_v1_leagues__leagueId__members_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/members/{member_id}": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        /** Update Member */
        readonly patch: operations["update_member_v1_leagues__leagueId__members__member_id__patch"];
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/members/{member_id}/reinstate": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Reinstate Member
         * @description Brings a removed member back and enrols them in the active season again.
         */
        readonly post: operations["reinstate_member_v1_leagues__leagueId__members__member_id__reinstate_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/members/{member_id}/release": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /** Release Member */
        readonly post: operations["release_member_v1_leagues__leagueId__members__member_id__release_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/members/{member_id}/withdraw": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        /**
         * Withdraw Member
         * @description Removes a member: off the team sheet and standings, open duties voided, records kept.
         *     An unclaimed name with no records is deleted instead.
         */
        readonly post: operations["withdraw_member_v1_leagues__leagueId__members__member_id__withdraw_post"];
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/picks": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /**
         * List Picks
         * @description Every fixture from the rules' starting round on whose kickoff is known, with its result
         *     and picks.
         */
        readonly get: operations["list_picks_v1_leagues__leagueId__picks_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/rounds/{round_number}/standings": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        /**
         * Record Standings
         * @description Captain replaces a round's Superbru table from the pool results. Members left out lose
         *     their row for the round.
         */
        readonly put: operations["record_standings_v1_leagues__leagueId__rounds__round_number__standings_put"];
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/rounds/{round_number}/standings/{member_id}": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly get?: never;
        readonly put?: never;
        readonly post?: never;
        /**
         * Clear Standing
         * @description Clears one member's stored round total (an override of the derived total).
         */
        readonly delete: operations["clear_standing_v1_leagues__leagueId__rounds__round_number__standings__member_id__delete"];
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/rules": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Get Rules */
        readonly get: operations["get_rules_v1_leagues__leagueId__rules_get"];
        /**
         * Update Rules
         * @description Captain or admin changes any subset of the season's Superbru rules.
         */
        readonly put: operations["update_rules_v1_leagues__leagueId__rules_put"];
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/stand-in-reviewer": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /** Get Stand In Reviewer */
        readonly get: operations["get_stand_in_reviewer_v1_leagues__leagueId__stand_in_reviewer_get"];
        /**
         * Set Stand In Reviewer
         * @description 404 `unknown_member`, 409 `captain_cannot_stand_in`, 409 `not_claimed`.
         */
        readonly put: operations["set_stand_in_reviewer_v1_leagues__leagueId__stand_in_reviewer_put"];
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/leagues/{leagueId}/standings": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /**
         * List Standings
         * @description Superbru round points per member for the active season, ranked within each round.
         */
        readonly get: operations["list_standings_v1_leagues__leagueId__standings_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
    readonly "/v1/me": {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        /**
         * Account
         * @description The account and its leagues. First claims every name reserved for the verified email.
         */
        readonly get: operations["account_v1_me_get"];
        readonly put?: never;
        readonly post?: never;
        readonly delete?: never;
        readonly options?: never;
        readonly head?: never;
        readonly patch?: never;
        readonly trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AccountDocument */
        readonly AccountDocument: {
            /** Isadmin */
            readonly isAdmin: boolean;
            /** Lastleagueid */
            readonly lastLeagueId: string | null;
            /** Leagues */
            readonly leagues: readonly components["schemas"]["LeagueSummary"][];
            /** Photourl */
            readonly photoUrl: string | null;
            /**
             * Userid
             * Format: uuid
             */
            readonly userId: string;
        };
        /** AdminCaptain */
        readonly AdminCaptain: {
            /** Claimed */
            readonly claimed: boolean;
            /** Displayname */
            readonly displayName: string;
            /**
             * Memberid
             * Format: uuid
             */
            readonly memberId: string;
        };
        /** AdminCounts */
        readonly AdminCounts: {
            /** Claimed */
            readonly claimed: number;
            /** Inseason */
            readonly inSeason: number;
            /** Members */
            readonly members: number;
            /** Withdrawn */
            readonly withdrawn: number;
        };
        /** AdminLeague */
        readonly AdminLeague: {
            /** Accentcolour */
            readonly accentColour: string | null;
            readonly captain: components["schemas"]["AdminCaptain"] | null;
            readonly competition: components["schemas"]["CompetitionRef"];
            readonly counts: components["schemas"]["AdminCounts"];
            /**
             * Createdat
             * Format: date-time
             */
            readonly createdAt: string;
            /** Emblempreset */
            readonly emblemPreset: string | null;
            /** Emblemurl */
            readonly emblemUrl: string | null;
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            /** Joincode */
            readonly joinCode: string | null;
            /** Mymemberid */
            readonly myMemberId: string | null;
            /** Name */
            readonly name: string;
            readonly rules: components["schemas"]["Rules"];
            readonly season: components["schemas"]["AdminSeason"] | null;
            /** Slug */
            readonly slug: string;
            /** Status */
            readonly status: string;
            /** Timezone */
            readonly timezone: string;
        };
        /** AdminMember */
        readonly AdminMember: {
            /**
             * Memberid
             * Format: uuid
             */
            readonly memberId: string;
        };
        /** AdminMembership */
        readonly AdminMembership: {
            /** Displayname */
            readonly displayName?: string | null;
            /** Fullname */
            readonly fullName?: string | null;
        };
        /** AdminSeason */
        readonly AdminSeason: {
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            /** Name */
            readonly name: string;
            /** Status */
            readonly status: string;
        };
        /**
         * Appearance
         * @description Every field is optional; a field left out is untouched and null clears it.
         *     emblemPreset and emblemPath cannot both be sent.
         */
        readonly Appearance: {
            /** Accentcolour */
            readonly accentColour?: string | null;
            /** Emblempath */
            readonly emblemPath?: string | null;
            /** Emblempreset */
            readonly emblemPreset?: string | null;
        };
        /** CaptainAppointment */
        readonly CaptainAppointment: {
            /**
             * Membershipid
             * Format: uuid
             */
            readonly membershipId: string;
        };
        /** CaseResponse */
        readonly CaseResponse: {
            /**
             * Choice
             * @enum {string}
             */
            readonly choice: "accept" | "veto";
            /**
             * Reason
             * @default
             */
            readonly reason: string;
        };
        /** Claim */
        readonly Claim: {
            /**
             * Membershipid
             * Format: uuid
             */
            readonly membershipId: string;
        };
        /** ClubView */
        readonly ClubView: {
            /** Id */
            readonly id: string;
            /** Name */
            readonly name: string;
            /** Shortname */
            readonly shortName: string;
        };
        /** CompetitionRef */
        readonly CompetitionRef: {
            /** Id */
            readonly id: string;
            /** Name */
            readonly name: string;
            /** Shortname */
            readonly shortName: string;
        };
        /** CompetitionSummary */
        readonly CompetitionSummary: {
            /** Id */
            readonly id: string;
            /** Lastround */
            readonly lastRound: number;
            /** Name */
            readonly name: string;
            /** Regularrounds */
            readonly regularRounds: number;
            /** Shortname */
            readonly shortName: string;
            /** Timezone */
            readonly timezone: string;
        };
        /** Created */
        readonly Created: {
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
        };
        /** Decision */
        readonly Decision: {
            /**
             * Decision
             * @enum {string}
             */
            readonly decision: "accepted" | "rejected";
            /**
             * Reason
             * @default
             */
            readonly reason: string;
        };
        /** DefaultDeadline */
        readonly DefaultDeadline: {
            /** Deadlineat */
            readonly deadlineAt: string | null;
        };
        /** Dispatch */
        readonly Dispatch: {
            /** Attempt */
            readonly attempt: number;
            /** Awayid */
            readonly awayId: string;
            /** Competitionid */
            readonly competitionId: string;
            /**
             * Dispatchedat
             * Format: date-time
             */
            readonly dispatchedAt: string;
            /** Fixtureid */
            readonly fixtureId: string;
            /** Homeid */
            readonly homeId: string;
            /**
             * Kickoffutc
             * Format: date-time
             */
            readonly kickoffUtc: string;
            /** Reason */
            readonly reason: string;
            /** Round */
            readonly round: number;
            /** Teamsheethash */
            readonly teamsheetHash: string;
        };
        /** Dispatches */
        readonly Dispatches: {
            /** Dispatches */
            readonly dispatches: readonly components["schemas"]["Dispatch"][];
            /**
             * Generatedat
             * Format: date-time
             */
            readonly generatedAt: string;
        };
        /**
         * DispatchRequest
         * @description Optional body of POST /v1/agent/dispatches: the competition, one fixture, and whether
         *     to force it.
         */
        readonly DispatchRequest: {
            /**
             * Competitionid
             * @default urc-2026-27
             */
            readonly competitionId: string;
            /** Fixtureid */
            readonly fixtureId?: string | null;
            /**
             * Force
             * @default false
             */
            readonly force: boolean;
        };
        /** DueFixture */
        readonly DueFixture: {
            /** Attempt */
            readonly attempt: number;
            /** Awayid */
            readonly awayId: string;
            /** Competitionid */
            readonly competitionId: string;
            /** Fixtureid */
            readonly fixtureId: string;
            /** Homeid */
            readonly homeId: string;
            /**
             * Kickoffutc
             * Format: date-time
             */
            readonly kickoffUtc: string;
            /** Reason */
            readonly reason: string;
            /** Round */
            readonly round: number;
            /** Teamsheethash */
            readonly teamsheetHash: string;
        };
        /** DueFixtures */
        readonly DueFixtures: {
            /** Fixtures */
            readonly fixtures: readonly components["schemas"]["DueFixture"][];
            /**
             * Generatedat
             * Format: date-time
             */
            readonly generatedAt: string;
        };
        /** Duty */
        readonly Duty: {
            /** Clockresetat */
            readonly clockResetAt: string | null;
            /** Completedat */
            readonly completedAt: string | null;
            /**
             * Createdat
             * Format: date-time
             */
            readonly createdAt: string;
            /** Deadlineat */
            readonly deadlineAt: string | null;
            /**
             * Display
             * @enum {string}
             */
            readonly display: "pending_deadline" | "open" | "overdue" | "under_review" | "completed" | "voided";
            /** Evidence */
            readonly evidence: readonly components["schemas"]["EvidenceLink"][];
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            readonly marks: components["schemas"]["Marks"];
            /**
             * Memberid
             * Format: uuid
             */
            readonly memberId: string;
            /** Membername */
            readonly memberName: string;
            /** Pickfixtureids */
            readonly pickFixtureIds: readonly string[];
            /** Reason */
            readonly reason: string;
            /** Roundnumber */
            readonly roundNumber: number | null;
            /**
             * Status
             * @enum {string}
             */
            readonly status: "pending_deadline" | "open" | "completed" | "voided";
            /** Title */
            readonly title: string;
            /**
             * Type
             * @enum {string}
             */
            readonly type: "spoon" | "pick_confirmation";
            /** Voidreason */
            readonly voidReason: string | null;
        };
        /** EmblemUploadGrant */
        readonly EmblemUploadGrant: {
            /** Bucket */
            readonly bucket: string;
            /** Path */
            readonly path: string;
            /** Token */
            readonly token: string;
        };
        /** EmblemUploadRequest */
        readonly EmblemUploadRequest: {
            /** Contenttype */
            readonly contentType: string;
            /** Sizebytes */
            readonly sizeBytes: number;
        };
        /**
         * EvidenceCase
         * @description One piece of evidence under the league's vote. Nothing here says who voted how:
         *     members see participation (respondedCount of eligibleCount), their own response, and
         *     once closed the outcome (status) and how it came about (resolution).
         */
        readonly EvidenceCase: {
            /**
             * Assetid
             * Format: uuid
             */
            readonly assetId: string;
            /** Canrespond */
            readonly canRespond: boolean;
            /** Canreview */
            readonly canReview: boolean;
            /**
             * Closesat
             * Format: date-time
             */
            readonly closesAt: string;
            /**
             * Dutyid
             * Format: uuid
             */
            readonly dutyId: string;
            /** Dutytitle */
            readonly dutyTitle: string;
            /**
             * Dutytype
             * @enum {string}
             */
            readonly dutyType: "spoon" | "pick_confirmation";
            /** Eligiblecount */
            readonly eligibleCount: number;
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            /** Isvoter */
            readonly isVoter: boolean;
            /**
             * Linkid
             * Format: uuid
             */
            readonly linkId: string;
            /** Myresponse */
            readonly myResponse: ("accept" | "veto") | null;
            /** Myvetoreason */
            readonly myVetoReason: string | null;
            /** Needsreviewer */
            readonly needsReviewer: boolean;
            /** Note */
            readonly note: string;
            /**
             * Openedat
             * Format: date-time
             */
            readonly openedAt: string;
            /** Resolution */
            readonly resolution: ("majority" | "auto" | "no_voters" | "veto_upheld" | "captain") | null;
            /** Resolvedat */
            readonly resolvedAt: string | null;
            /** Respondedcount */
            readonly respondedCount: number;
            /** Roundnumber */
            readonly roundNumber: number | null;
            /**
             * Status
             * @enum {string}
             */
            readonly status: "open" | "in_review" | "accepted" | "rejected" | "superseded";
            /**
             * Subjectid
             * Format: uuid
             */
            readonly subjectId: string;
            /** Subjectname */
            readonly subjectName: string;
            /**
             * Submissionid
             * Format: uuid
             */
            readonly submissionId: string;
            /**
             * Submittedat
             * Format: date-time
             */
            readonly submittedAt: string;
            /** Submittername */
            readonly submitterName: string;
            /** Vetoreason */
            readonly vetoReason: string | null;
        };
        /**
         * EvidenceCaseSummary
         * @description The evidence's case, for the duty card. resolution and resolvedAt are set once it is
         *     accepted or rejected (resolvedAt also once superseded).
         */
        readonly EvidenceCaseSummary: {
            /**
             * Closesat
             * Format: date-time
             */
            readonly closesAt: string;
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            /** Resolution */
            readonly resolution: ("majority" | "auto" | "no_voters" | "veto_upheld" | "captain") | null;
            /** Resolvedat */
            readonly resolvedAt: string | null;
            /**
             * Status
             * @enum {string}
             */
            readonly status: "open" | "in_review" | "accepted" | "rejected" | "superseded";
        };
        /** EvidenceLink */
        readonly EvidenceLink: {
            /**
             * Assetid
             * Format: uuid
             */
            readonly assetId: string;
            /** Claimedcompletedat */
            readonly claimedCompletedAt: string | null;
            /** Decidedat */
            readonly decidedAt: string | null;
            /** Decision */
            readonly decision: string;
            /** Effectivecompletedat */
            readonly effectiveCompletedAt: string | null;
            readonly evidenceCase: components["schemas"]["EvidenceCaseSummary"] | null;
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            /** Note */
            readonly note: string;
            /** Reason */
            readonly reason: string | null;
            /**
             * Submissionid
             * Format: uuid
             */
            readonly submissionId: string;
            /**
             * Submittedat
             * Format: date-time
             */
            readonly submittedAt: string;
            /**
             * Submitterid
             * Format: uuid
             */
            readonly submitterId: string;
            /** Submittername */
            readonly submitterName: string;
        };
        /** Factor */
        readonly Factor: {
            /** Sources */
            readonly sources: readonly number[];
            /** Text */
            readonly text: string;
        };
        /** FeedItem */
        readonly FeedItem: {
            /** Actorname */
            readonly actorName: string | null;
            /** Detail */
            readonly detail: string;
            /** Dutyid */
            readonly dutyId: string | null;
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            /** Kind */
            readonly kind: string;
            /**
             * Occurredat
             * Format: date-time
             */
            readonly occurredAt: string;
            /** Roundnumber */
            readonly roundNumber: number | null;
            /** Subjectname */
            readonly subjectName: string | null;
            /** Title */
            readonly title: string;
        };
        /** FixturePicks */
        readonly FixturePicks: {
            /** Fixtureid */
            readonly fixtureId: string;
            /** Kickoffutc */
            readonly kickoffUtc: string | null;
            /** Locked */
            readonly locked: boolean;
            readonly myPick: components["schemas"]["Pick"] | null;
            /** Picks */
            readonly picks: readonly components["schemas"]["Pick"][];
            readonly result: components["schemas"]["FixtureResult"] | null;
            /** Roundnumber */
            readonly roundNumber: number;
        };
        /** FixturePicksUpdate */
        readonly FixturePicksUpdate: {
            /** Picks */
            readonly picks: readonly components["schemas"]["StewardPick"][];
        };
        /** FixtureResult */
        readonly FixtureResult: {
            /** Awayscore */
            readonly awayScore: number;
            /** Homescore */
            readonly homeScore: number;
            /**
             * State
             * @enum {string}
             */
            readonly state: "live" | "half_time" | "full_time" | "postponed" | "cancelled";
        };
        /** HTTPValidationError */
        readonly HTTPValidationError: {
            /** Detail */
            readonly detail?: readonly components["schemas"]["ValidationError"][];
        };
        /** JoinCode */
        readonly JoinCode: {
            /** Joincode */
            readonly joinCode: string;
        };
        /** JoinInvitation */
        readonly JoinInvitation: {
            /** Alreadymember */
            readonly alreadyMember: boolean;
            readonly league: components["schemas"]["JoinLeague"];
            /** Unclaimed */
            readonly unclaimed: readonly components["schemas"]["UnclaimedName"][];
        };
        /** JoinLeague */
        readonly JoinLeague: {
            /** Accentcolour */
            readonly accentColour: string | null;
            readonly competition: components["schemas"]["CompetitionRef"];
            /** Emblempreset */
            readonly emblemPreset: string | null;
            /** Emblemurl */
            readonly emblemUrl: string | null;
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            /** Name */
            readonly name: string;
            /** Seasonname */
            readonly seasonName: string;
            /** Slug */
            readonly slug: string;
            /** Timezone */
            readonly timezone: string;
        };
        /** KeyFactors */
        readonly KeyFactors: {
            /** Away */
            readonly away: readonly components["schemas"]["Factor"][];
            /** Home */
            readonly home: readonly components["schemas"]["Factor"][];
        };
        /**
         * LeagueSummary
         * @description One league in the account's list. Member fields are null in the admin's view of a
         *     league they do not belong to.
         */
        readonly LeagueSummary: {
            /** Accentcolour */
            readonly accentColour: string | null;
            readonly competition: components["schemas"]["CompetitionRef"];
            /** Displayname */
            readonly displayName: string | null;
            /** Emblempreset */
            readonly emblemPreset: string | null;
            /** Emblemurl */
            readonly emblemUrl: string | null;
            /** Favouriteteamid */
            readonly favouriteTeamId: string | null;
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            /** Inseason */
            readonly inSeason: boolean;
            /** Iscaptain */
            readonly isCaptain: boolean;
            /** Memberid */
            readonly memberId: string | null;
            /** Name */
            readonly name: string;
            readonly rules: components["schemas"]["Rules"];
            /** Seasonname */
            readonly seasonName: string;
            /** Slug */
            readonly slug: string;
            /** Timezone */
            readonly timezone: string;
        };
        /**
         * LeagueUpdate
         * @description Fields left out (or null) are untouched.
         */
        readonly LeagueUpdate: {
            /** Name */
            readonly name?: string | null;
            readonly rules?: components["schemas"]["RulesChange"] | null;
            /** Status */
            readonly status?: ("active" | "archived") | null;
            /** Timezone */
            readonly timezone?: string | null;
        };
        /** Marks */
        readonly Marks: {
            /**
             * Asof
             * Format: date-time
             */
            readonly asOf: string;
            /** Explanation */
            readonly explanation: string;
            /** Marks */
            readonly marks: number;
            /** Nextmarkat */
            readonly nextMarkAt: string | null;
            /** Overduehours */
            readonly overdueHours: number;
        };
        /** MatchCentre */
        readonly MatchCentre: {
            readonly away: components["schemas"]["ClubView"] | null;
            /** Fixtureid */
            readonly fixtureId: string;
            /**
             * Generatedat
             * Format: date-time
             */
            readonly generatedAt: string;
            readonly home: components["schemas"]["ClubView"] | null;
            /** Kickoffutc */
            readonly kickoffUtc: string | null;
            /** Round */
            readonly round: number;
            readonly score: components["schemas"]["Section"];
            readonly teamsheets: components["schemas"]["Section"];
            /** Venue */
            readonly venue: string | null;
            readonly weather: components["schemas"]["Section"];
        };
        /** MatchPreview */
        readonly MatchPreview: {
            /** Fixtureid */
            readonly fixtureId: string;
            readonly preview: components["schemas"]["PreviewView"] | null;
        };
        /** MatchScore */
        readonly MatchScore: {
            readonly away: components["schemas"]["SideScore"];
            /** Clockrunning */
            readonly clockRunning: boolean;
            /** Fixtureid */
            readonly fixtureId: string;
            readonly home: components["schemas"]["SideScore"];
            /** Minute */
            readonly minute: number | null;
            /** Period */
            readonly period: string | null;
            /**
             * State
             * @enum {string}
             */
            readonly state: "scheduled" | "live" | "half_time" | "full_time" | "postponed" | "cancelled";
        };
        /**
         * Me
         * @description The caller in one league. The admin viewing a league they do not belong to gets
         *     memberId null, displayName "Admin" and isCaptain false.
         */
        readonly Me: {
            /** Accentcolour */
            readonly accentColour: string | null;
            /** Administers */
            readonly administers: boolean;
            readonly competition: components["schemas"]["CompetitionRef"];
            /** Displayname */
            readonly displayName: string;
            /** Emblempreset */
            readonly emblemPreset: string | null;
            /** Emblemurl */
            readonly emblemUrl: string | null;
            /** Favouriteteamid */
            readonly favouriteTeamId: string | null;
            /** Inseason */
            readonly inSeason: boolean;
            /** Isadmin */
            readonly isAdmin: boolean;
            /** Iscaptain */
            readonly isCaptain: boolean;
            /** Joincode */
            readonly joinCode: string | null;
            /**
             * Leagueid
             * Format: uuid
             */
            readonly leagueId: string;
            /** Leaguename */
            readonly leagueName: string;
            /** Memberid */
            readonly memberId: string | null;
            /** Notificationsreadat */
            readonly notificationsReadAt: string | null;
            /** Notificationsreadkeys */
            readonly notificationsReadKeys: readonly string[];
            /** Photourl */
            readonly photoUrl: string | null;
            readonly rules: components["schemas"]["Rules"];
            /** Seasonname */
            readonly seasonName: string;
            /** Slug */
            readonly slug: string;
            /** Timezone */
            readonly timezone: string;
        };
        /** Member */
        readonly Member: {
            /** Claimed */
            readonly claimed: boolean;
            /** Displayname */
            readonly displayName: string;
            /** Email */
            readonly email?: string | null;
            /** Fullname */
            readonly fullName: string;
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
            /** Inseason */
            readonly inSeason: boolean;
            /** Leftat */
            readonly leftAt?: string | null;
            /** Status */
            readonly status: string;
            /** Withdrawalreason */
            readonly withdrawalReason?: string | null;
        };
        /** MemberMarks */
        readonly MemberMarks: {
            /** Marks */
            readonly marks: number;
            /**
             * Memberid
             * Format: uuid
             */
            readonly memberId: string;
            /** Membername */
            readonly memberName: string;
            /** Openduties */
            readonly openDuties: number;
        };
        /** MemberUpdate */
        readonly MemberUpdate: {
            /**
             * Clearemail
             * @default false
             */
            readonly clearEmail: boolean;
            /** Displayname */
            readonly displayName?: string | null;
            /** Email */
            readonly email?: string | null;
        };
        /** Models */
        readonly Models: {
            /** Researcher */
            readonly researcher?: string | null;
            /** Writer */
            readonly writer: string;
        };
        /** Mood */
        readonly Mood: {
            /** Note */
            readonly note: string;
            /** Score */
            readonly score: number;
            /** Sources */
            readonly sources: readonly number[];
        };
        /** NewDuty */
        readonly NewDuty: {
            /** Deadlineat */
            readonly deadlineAt?: string | null;
            /**
             * Memberid
             * Format: uuid
             */
            readonly memberId: string;
            /** Pickfixtureids */
            readonly pickFixtureIds?: readonly string[] | null;
            /**
             * Reason
             * @default
             */
            readonly reason: string;
            /** Roundnumber */
            readonly roundNumber?: number | null;
            /**
             * Type
             * @enum {string}
             */
            readonly type: "spoon" | "pick_confirmation";
        };
        /**
         * NewLeague
         * @description The slug, competition, time zone, members, captain, emblem and colour are checked by
         *     `service.create_league`, whose codes pass through.
         */
        readonly NewLeague: {
            /** Accentcolour */
            readonly accentColour?: string | null;
            /**
             * Addme
             * @default false
             */
            readonly addMe: boolean;
            /** Captaindisplayname */
            readonly captainDisplayName: string;
            /** Captainemail */
            readonly captainEmail: string | null;
            /** Competitionid */
            readonly competitionId: string;
            /** Emblempreset */
            readonly emblemPreset?: string | null;
            /** Members */
            readonly members: readonly components["schemas"]["NewLeagueMember"][];
            /** Name */
            readonly name: string;
            readonly rules?: components["schemas"]["RulesChange"] | null;
            /** Seasonname */
            readonly seasonName: string;
            /** Slug */
            readonly slug: string;
            /** Timezone */
            readonly timezone?: string | null;
        };
        /** NewLeagueMember */
        readonly NewLeagueMember: {
            /** Displayname */
            readonly displayName: string;
            /** Fullname */
            readonly fullName: string;
        };
        /** NewMember */
        readonly NewMember: {
            /** Displayname */
            readonly displayName: string;
            /** Email */
            readonly email?: string | null;
            /** Fullname */
            readonly fullName: string;
        };
        /** NewPick */
        readonly NewPick: {
            /** Margin */
            readonly margin?: number | null;
            /**
             * Side
             * @enum {string}
             */
            readonly side: "home" | "away" | "draw" | "missed";
        };
        /** NotificationsRead */
        readonly NotificationsRead: {
            /** Readat */
            readonly readAt: string | null;
            /** Readkeys */
            readonly readKeys: readonly string[];
        };
        /** PhotoUploadGrant */
        readonly PhotoUploadGrant: {
            /** Bucket */
            readonly bucket: string;
            /** Path */
            readonly path: string;
            /** Token */
            readonly token: string;
        };
        /** PhotoUploadRequest */
        readonly PhotoUploadRequest: {
            /** Contenttype */
            readonly contentType: string;
            /** Sizebytes */
            readonly sizeBytes: number;
        };
        /** Pick */
        readonly Pick: {
            /** Dutyid */
            readonly dutyId: string | null;
            /** Isdefault */
            readonly isDefault: boolean;
            /** Margin */
            readonly margin: number | null;
            /**
             * Memberid
             * Format: uuid
             */
            readonly memberId: string;
            /** Membername */
            readonly memberName: string;
            /**
             * Side
             * @enum {string}
             */
            readonly side: "home" | "away" | "draw" | "missed";
        };
        /** Playback */
        readonly Playback: {
            /**
             * Expiresat
             * Format: date-time
             */
            readonly expiresAt: string;
            /** Filename */
            readonly filename: string;
            /** Url */
            readonly url: string;
        };
        /** PreviewSubmission */
        readonly PreviewSubmission: {
            /**
             * Competitionid
             * @default urc-2026-27
             */
            readonly competitionId: string;
            /** Fixtureid */
            readonly fixtureId: string;
            /** Inputshash */
            readonly inputsHash: string;
            readonly keyFactors: components["schemas"]["KeyFactors"];
            readonly models: components["schemas"]["Models"];
            /** Runid */
            readonly runId?: string | null;
            readonly sentiment: components["schemas"]["Sentiment"];
            /** Sources */
            readonly sources: readonly components["schemas"]["Source"][];
            /** Summary */
            readonly summary: string;
            /** Teamsheethash */
            readonly teamsheetHash: string;
            readonly usage?: components["schemas"]["Usage"] | null;
        };
        /**
         * PreviewView
         * @description The latest preview as members read it.
         */
        readonly PreviewView: {
            /**
             * Generatedat
             * Format: date-time
             */
            readonly generatedAt: string;
            readonly keyFactors: components["schemas"]["KeyFactors"];
            /** Revision */
            readonly revision: number;
            readonly sentiment: components["schemas"]["Sentiment"];
            /** Sources */
            readonly sources: readonly components["schemas"]["Source"][];
            /** Summary */
            readonly summary: string;
        };
        /** ProfileUpdate */
        readonly ProfileUpdate: {
            /** Favouriteteamid */
            readonly favouriteTeamId: string;
            /** Photopath */
            readonly photoPath?: string | null;
            /**
             * Removephoto
             * @default false
             */
            readonly removePhoto: boolean;
        };
        /** Reason */
        readonly Reason: {
            /** Reason */
            readonly reason: string;
        };
        /**
         * RoundEvent
         * @description One competition milestone of a fixture. `occurredAt` stays put once reported.
         */
        readonly RoundEvent: {
            /** Awayscore */
            readonly awayScore?: number | null;
            /** Fixtureid */
            readonly fixtureId: string;
            /** Homescore */
            readonly homeScore?: number | null;
            /**
             * Kind
             * @enum {string}
             */
            readonly kind: "teamsheets_published" | "preview_published" | "kicked_off" | "full_time";
            /**
             * Occurredat
             * Format: date-time
             */
            readonly occurredAt: string;
            /** Revision */
            readonly revision?: number | null;
        };
        /**
         * RoundScores
         * @description Scores for every fixture in a round. `status` describes the feed, not the matches.
         */
        readonly RoundScores: {
            /** Fetchedat */
            readonly fetchedAt?: string | null;
            /**
             * Generatedat
             * Format: date-time
             */
            readonly generatedAt: string;
            /** Matches */
            readonly matches: readonly components["schemas"]["MatchScore"][];
            /** Reason */
            readonly reason?: string | null;
            /** Round */
            readonly round: number;
            /** Source */
            readonly source: string;
            /**
             * Status
             * @enum {string}
             */
            readonly status: "ok" | "not_published" | "too_early" | "past" | "unavailable";
        };
        /** RoundStandings */
        readonly RoundStandings: {
            /** Standings */
            readonly standings: readonly components["schemas"]["StandingEntry"][];
        };
        /** RoundUpdates */
        readonly RoundUpdates: {
            /** Events */
            readonly events: readonly components["schemas"]["RoundEvent"][];
            /**
             * Generatedat
             * Format: date-time
             */
            readonly generatedAt: string;
            /** Round */
            readonly round: number;
        };
        /**
         * Rules
         * @description The active season's Superbru rules (service.DEFAULT_RULES with the season's changes).
         */
        readonly Rules: {
            /** Bonuspoint */
            readonly bonusPoint: boolean;
            /** Bonuspointminimumshare */
            readonly bonusPointMinimumShare: number;
            /** Bonuspointrangecapped */
            readonly bonusPointRangeCapped: boolean;
            /** Bonuspointsplit */
            readonly bonusPointSplit: boolean;
            /** Bonuspointvalue */
            readonly bonusPointValue: number;
            /** Bonusrange */
            readonly bonusRange: number;
            /** Defaultpicks */
            readonly defaultPicks: boolean;
            /** Grandslampoints */
            readonly grandSlamPoints: number;
            /** Marginpoint */
            readonly marginPoint: number;
            /** Marginwindow */
            readonly marginWindow: number;
            /** Pickshiddenbeforekickoff */
            readonly picksHiddenBeforeKickoff: boolean;
            /** Previouschampionmemberid */
            readonly previousChampionMemberId: string | null;
            /** Startinground */
            readonly startingRound: number;
            readonly winPoints: components["schemas"]["WinPoints"];
        };
        /**
         * RulesChange
         * @description Any subset of the rules; winPoints may be partial. Only the fields sent change;
         *     previousChampionMemberId null clears the champion. The service checks the rest (422
         *     `invalid_rules`, 404 `unknown_member` for a champion outside the league).
         */
        readonly RulesChange: {
            /** Bonuspoint */
            readonly bonusPoint?: boolean | null;
            /** Bonuspointminimumshare */
            readonly bonusPointMinimumShare?: number | null;
            /** Bonuspointrangecapped */
            readonly bonusPointRangeCapped?: boolean | null;
            /** Bonuspointsplit */
            readonly bonusPointSplit?: boolean | null;
            /** Bonuspointvalue */
            readonly bonusPointValue?: number | null;
            /** Bonusrange */
            readonly bonusRange?: number | null;
            /** Defaultpicks */
            readonly defaultPicks?: boolean | null;
            /** Grandslampoints */
            readonly grandSlamPoints?: number | null;
            /** Marginpoint */
            readonly marginPoint?: number | null;
            /** Marginwindow */
            readonly marginWindow?: number | null;
            /** Pickshiddenbeforekickoff */
            readonly picksHiddenBeforeKickoff?: boolean | null;
            /** Previouschampionmemberid */
            readonly previousChampionMemberId?: string | null;
            /** Startinground */
            readonly startingRound?: number | null;
            readonly winPoints?: components["schemas"]["WinPointsChange"] | null;
        };
        /**
         * Section
         * @description One provider's contribution. `status` is meaningful even when data is missing.
         */
        readonly Section: {
            /** Fetchedat */
            readonly fetchedAt?: string | null;
            /** Source */
            readonly source: string;
            /**
             * Status
             * @enum {string}
             */
            readonly status: "ok" | "not_published" | "too_early" | "past" | "unavailable";
        } & {
            readonly [key: string]: unknown;
        };
        /** Sentiment */
        readonly Sentiment: {
            readonly away: components["schemas"]["Mood"];
            readonly home: components["schemas"]["Mood"];
        };
        /** SideScore */
        readonly SideScore: {
            /** Halftime */
            readonly halfTime: number | null;
            /** Score */
            readonly score: number | null;
        };
        /** Source */
        readonly Source: {
            /** Publishedat */
            readonly publishedAt?: string | null;
            /** Publisher */
            readonly publisher?: string | null;
            /** Title */
            readonly title: string;
            /** Url */
            readonly url: string;
        };
        /** StandInChange */
        readonly StandInChange: {
            /** Memberid */
            readonly memberId: string | null;
        };
        /** Standing */
        readonly Standing: {
            /**
             * Memberid
             * Format: uuid
             */
            readonly memberId: string;
            /** Membername */
            readonly memberName: string;
            /** Points */
            readonly points: number;
            /** Rank */
            readonly rank: number;
            /** Roundnumber */
            readonly roundNumber: number;
        };
        /** StandingEntry */
        readonly StandingEntry: {
            /**
             * Memberid
             * Format: uuid
             */
            readonly memberId: string;
            /** Points */
            readonly points: number | string;
        };
        /**
         * StandInReviewer
         * @description Reviews vetoes when the captain is involved. Both null when none is named.
         */
        readonly StandInReviewer: {
            /** Memberid */
            readonly memberId: string | null;
            /** Membername */
            readonly memberName: string | null;
        };
        /** StewardPick */
        readonly StewardPick: {
            /** Dutyid */
            readonly dutyId?: string | null;
            /**
             * Isdefault
             * @default false
             */
            readonly isDefault: boolean;
            /** Margin */
            readonly margin?: number | null;
            /**
             * Memberid
             * Format: uuid
             */
            readonly memberId: string;
            /**
             * Side
             * @enum {string}
             */
            readonly side: "home" | "away" | "draw" | "missed";
        };
        /** StoredPreview */
        readonly StoredPreview: {
            /** Competitionid */
            readonly competitionId: string;
            /** Fixtureid */
            readonly fixtureId: string;
            /**
             * Generatedat
             * Format: date-time
             */
            readonly generatedAt: string;
            /** Id */
            readonly id: string;
            /** Revision */
            readonly revision: number;
        };
        /** Submission */
        readonly Submission: {
            /**
             * Assetid
             * Format: uuid
             */
            readonly assetId: string;
            /** Claimedcompletedat */
            readonly claimedCompletedAt?: string | null;
            /** Dutyids */
            readonly dutyIds: readonly string[];
            /**
             * Note
             * @default
             */
            readonly note: string;
            /** Subjectmemberid */
            readonly subjectMemberId?: string | null;
        };
        /** UnclaimedName */
        readonly UnclaimedName: {
            /** Displayname */
            readonly displayName: string;
            /** Fullname */
            readonly fullName: string;
            /**
             * Id
             * Format: uuid
             */
            readonly id: string;
        };
        /** UploadGrant */
        readonly UploadGrant: {
            /**
             * Assetid
             * Format: uuid
             */
            readonly assetId: string;
            /** Bucket */
            readonly bucket: string;
            /**
             * Expiresat
             * Format: date-time
             */
            readonly expiresAt: string;
            /** Path */
            readonly path: string;
            /** Token */
            readonly token: string;
        };
        /** UploadRequest */
        readonly UploadRequest: {
            /** Contenttype */
            readonly contentType: string;
            /** Filename */
            readonly filename: string;
            /** Sizebytes */
            readonly sizeBytes: number;
        };
        /** Usage */
        readonly Usage: {
            /** Inputtokens */
            readonly inputTokens: number;
            /** Outputtokens */
            readonly outputTokens: number;
            /**
             * Websearches
             * @default 0
             */
            readonly webSearches: number;
        };
        /** ValidationError */
        readonly ValidationError: {
            /** Context */
            readonly ctx?: Record<string, never>;
            /** Input */
            readonly input?: unknown;
            /** Location */
            readonly loc: readonly (string | number)[];
            /** Message */
            readonly msg: string;
            /** Error Type */
            readonly type: string;
        };
        /** VetoReview */
        readonly VetoReview: {
            /** Reason */
            readonly reason: string;
            /**
             * Ruling
             * @enum {string}
             */
            readonly ruling: "upheld" | "dismissed";
        };
        /** WinPoints */
        readonly WinPoints: {
            /** Final */
            readonly final: number;
            /** Quarterfinal */
            readonly quarterFinal: number;
            /** Regular */
            readonly regular: number;
            /** Semifinal */
            readonly semiFinal: number;
        };
        /** WinPointsChange */
        readonly WinPointsChange: {
            /** Final */
            readonly final?: number | null;
            /** Quarterfinal */
            readonly quarterFinal?: number | null;
            /** Regular */
            readonly regular?: number | null;
            /** Semifinal */
            readonly semiFinal?: number | null;
        };
        /** Withdrawal */
        readonly Withdrawal: {
            /** Reason */
            readonly reason: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    readonly list_leagues_v1_admin_leagues_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["AdminLeague"][];
                };
            };
        };
    };
    readonly create_league_v1_admin_leagues_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["NewLeague"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 201: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["AdminLeague"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly update_league_v1_admin_leagues__leagueId__patch: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["LeagueUpdate"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["AdminLeague"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly appoint_captain_v1_admin_leagues__leagueId__captain_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["CaptainAppointment"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["AdminLeague"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly add_me_v1_admin_leagues__leagueId__members_me_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: {
            readonly content: {
                readonly "application/json": components["schemas"]["AdminMembership"] | null;
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 201: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["AdminMember"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly dispatch_v1_agent_dispatches_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly requestBody?: {
            readonly content: {
                readonly "application/json": components["schemas"]["DispatchRequest"] | null;
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Dispatches"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly fixture_state_v1_agent_fixtures__fixture_id__state_get: {
        readonly parameters: {
            readonly query?: {
                readonly competitionId?: string;
            };
            readonly header?: never;
            readonly path: {
                readonly fixture_id: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": {
                        readonly [key: string]: unknown;
                    };
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly due_v1_agent_fixtures_due_get: {
        readonly parameters: {
            readonly query?: {
                readonly competitionId?: string;
            };
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["DueFixtures"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly save_preview_v1_agent_previews_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["PreviewSubmission"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 201: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["StoredPreview"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly list_competitions_v1_competitions_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["CompetitionSummary"][];
                };
            };
        };
    };
    readonly match_centre_v1_competitions__competitionId__matches__fixture_id__get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly competitionId: string;
                readonly fixture_id: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["MatchCentre"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly match_preview_v1_competitions__competitionId__matches__fixture_id__preview_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly competitionId: string;
                readonly fixture_id: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["MatchPreview"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly round_scores_v1_competitions__competitionId__rounds__round_number__scores_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly competitionId: string;
                readonly round_number: number;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["RoundScores"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly round_updates_v1_competitions__competitionId__rounds__round_number__updates_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly competitionId: string;
                readonly round_number: number;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["RoundUpdates"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly health_v1_health_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": unknown;
                };
            };
        };
    };
    readonly join_invitation_v1_join__code__get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly code: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["JoinInvitation"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly join_v1_join__code__post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly code: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["Claim"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Me"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly update_appearance_v1_leagues__leagueId__appearance_put: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["Appearance"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Me"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly list_duties_v1_leagues__leagueId__duties_get: {
        readonly parameters: {
            readonly query?: {
                readonly round?: number | null;
            };
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["Duty"][];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly create_duty_v1_leagues__leagueId__duties_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["NewDuty"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 201: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Duty"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly reset_duty_clock_v1_leagues__leagueId__duties__duty_id__reset_clock_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly duty_id: string;
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["Reason"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Duty"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly void_duty_v1_leagues__leagueId__duties__duty_id__void_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly duty_id: string;
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["Reason"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Duty"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly duty_default_deadline_v1_leagues__leagueId__duties_default_deadline_get: {
        readonly parameters: {
            readonly query: {
                readonly round: number;
                readonly type: "spoon" | "pick_confirmation";
            };
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["DefaultDeadline"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly reserve_emblem_upload_v1_leagues__leagueId__emblem_uploads_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["EmblemUploadRequest"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 201: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["EmblemUploadGrant"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly submit_evidence_v1_leagues__leagueId__evidence_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["Submission"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 201: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Created"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly playback_v1_leagues__leagueId__evidence_assets__asset_id__playback_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly asset_id: string;
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Playback"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly list_cases_v1_leagues__leagueId__evidence_cases_get: {
        readonly parameters: {
            readonly query?: {
                readonly round?: number | null;
            };
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["EvidenceCase"][];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly respond_to_case_v1_leagues__leagueId__evidence_cases__case_id__response_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly case_id: string;
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["CaseResponse"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["EvidenceCase"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly review_case_v1_leagues__leagueId__evidence_cases__case_id__review_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly case_id: string;
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["VetoReview"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["EvidenceCase"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly decide_v1_leagues__leagueId__evidence_links__link_id__decision_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
                readonly link_id: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["Decision"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 204: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly reserve_upload_v1_leagues__leagueId__evidence_uploads_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["UploadRequest"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 201: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["UploadGrant"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly feed_v1_leagues__leagueId__feed_get: {
        readonly parameters: {
            readonly query?: {
                readonly limit?: number;
                readonly round?: number | null;
            };
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["FeedItem"][];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly close_join_code_v1_leagues__leagueId__join_code_delete: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 204: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly rotate_join_code_v1_leagues__leagueId__join_code_rotate_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["JoinCode"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly marks_v1_leagues__leagueId__marks_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["MemberMarks"][];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly record_picks_v1_leagues__leagueId__matches__fixture_id__picks_put: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly fixture_id: string;
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["FixturePicksUpdate"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["FixturePicks"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly delete_pick_v1_leagues__leagueId__matches__fixture_id__picks__member_id__delete: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly fixture_id: string;
                readonly leagueId: string;
                readonly member_id: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 204: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly save_own_pick_v1_leagues__leagueId__matches__fixture_id__picks_me_put: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly fixture_id: string;
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["NewPick"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["FixturePicks"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly me_v1_leagues__leagueId__me_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Me"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly record_last_league_v1_leagues__leagueId__me_last_put: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 204: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly update_notifications_v1_leagues__leagueId__me_notifications_put: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["NotificationsRead"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["NotificationsRead"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly reserve_photo_upload_v1_leagues__leagueId__me_photo_uploads_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["PhotoUploadRequest"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 201: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["PhotoUploadGrant"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly update_profile_v1_leagues__leagueId__me_profile_put: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["ProfileUpdate"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Me"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly list_members_v1_leagues__leagueId__members_get: {
        readonly parameters: {
            readonly query?: {
                readonly include?: "withdrawn" | null;
            };
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["Member"][];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly add_member_v1_leagues__leagueId__members_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["NewMember"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 201: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Created"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly update_member_v1_leagues__leagueId__members__member_id__patch: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
                readonly member_id: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["MemberUpdate"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 204: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly reinstate_member_v1_leagues__leagueId__members__member_id__reinstate_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
                readonly member_id: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 204: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly release_member_v1_leagues__leagueId__members__member_id__release_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
                readonly member_id: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 204: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly withdraw_member_v1_leagues__leagueId__members__member_id__withdraw_post: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
                readonly member_id: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["Withdrawal"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 204: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly list_picks_v1_leagues__leagueId__picks_get: {
        readonly parameters: {
            readonly query?: {
                readonly round?: number | null;
            };
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["FixturePicks"][];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly record_standings_v1_leagues__leagueId__rounds__round_number__standings_put: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
                readonly round_number: number;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["RoundStandings"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["Standing"][];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly clear_standing_v1_leagues__leagueId__rounds__round_number__standings__member_id__delete: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
                readonly member_id: string;
                readonly round_number: number;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 204: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly get_rules_v1_leagues__leagueId__rules_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Rules"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly update_rules_v1_leagues__leagueId__rules_put: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["RulesChange"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["Rules"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly get_stand_in_reviewer_v1_leagues__leagueId__stand_in_reviewer_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["StandInReviewer"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly set_stand_in_reviewer_v1_leagues__leagueId__stand_in_reviewer_put: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody: {
            readonly content: {
                readonly "application/json": components["schemas"]["StandInChange"];
            };
        };
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["StandInReviewer"];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly list_standings_v1_leagues__leagueId__standings_get: {
        readonly parameters: {
            readonly query?: {
                readonly round?: number | null;
            };
            readonly header?: never;
            readonly path: {
                readonly leagueId: string;
            };
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": readonly components["schemas"]["Standing"][];
                };
            };
            /** @description Validation Error */
            readonly 422: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    readonly account_v1_me_get: {
        readonly parameters: {
            readonly query?: never;
            readonly header?: never;
            readonly path?: never;
            readonly cookie?: never;
        };
        readonly requestBody?: never;
        readonly responses: {
            /** @description Successful Response */
            readonly 200: {
                headers: {
                    readonly [name: string]: unknown;
                };
                content: {
                    readonly "application/json": components["schemas"]["AccountDocument"];
                };
            };
        };
    };
}
