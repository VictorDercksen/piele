-- The preset league emblems were replaced by a rugby set (ball, posts, jersey, boot, scrum,
-- wings, trophy). Leagues on a retired preset move to its closest replacement.
update piele.leagues
set emblem_path = 'preset:' || case emblem_path
    when 'preset:oak' then 'ball'
    when 'preset:anvil' then 'posts'
    when 'preset:lantern' then 'jersey'
    when 'preset:compass' then 'boot'
    when 'preset:chevron' then 'scrum'
    when 'preset:crown' then 'trophy'
    when 'preset:wave' then 'wings'
    when 'preset:star' then 'ball'
  end
where emblem_path in (
  'preset:oak', 'preset:anvil', 'preset:lantern', 'preset:compass',
  'preset:chevron', 'preset:crown', 'preset:wave', 'preset:star'
);
