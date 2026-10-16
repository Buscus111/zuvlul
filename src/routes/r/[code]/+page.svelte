<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import {
    agreementPercent,
    countEntries,
    coverageLabel,
    worstLabel,
  } from "#lib/format";
  import {
    TEXT_MARKS,
    YESNO_MARKS,
    formatRemaining,
    isDirectImage,
    modeLabel,
    scaleLabel,
  } from "#lib/scales";
  import type { BallotOption, PublicState } from "#lib/types";

  let { data } = $props();
  let local = $state<PublicState | null>(null);
  let state = $derived(local ?? data.state);
  let errorMessage = $state("");
  let pending = $state(false);
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let mounted = $state(false);
  let nowTick = $state(Date.now());
  let clockOffset = $state(0);
  let polling = false;
  let nudged = false;

  let remaining = $derived.by(() => {
    void nowTick;
    if (!state.phaseEndsAt) return null;
    return state.phaseEndsAt - (Date.now() + clockOffset);
  });

  function apply(next: PublicState) {
    clockOffset = next.serverNow - Date.now();
    local = next;
  }

  async function poll() {
    if (!browser || polling) return;
    polling = true;
    try {
      const response = await fetch(`/r/${state.code}/state`);
      if (!response.ok) return;
      apply(await response.json());
    } catch {
      // The next tick retries. A missed poll only delays the phase change.
    } finally {
      polling = false;
    }
  }

  async function send(body: Record<string, unknown>) {
    pending = true;
    errorMessage = "";
    try {
      const response = await fetch(`/r/${state.code}/state`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        errorMessage =
          typeof payload.error === "string"
            ? payload.error
            : "Не получилось сохранить";
        return false;
      }
      apply(payload);
      return true;
    } catch {
      errorMessage = "Нет связи с комнатой";
      return false;
    } finally {
      pending = false;
    }
  }

  async function addOption(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    const saved = await send({
      action: "add",
      title: fields.get("title"),
      note: fields.get("note"),
      link: fields.get("link"),
    });
    if (saved) form.reset();
  }

  async function join(event: SubmitEvent) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    await send({ action: "join", name: fields.get("name") });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(state.code);
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copied = false;
      }, 3000);
    } catch {
      errorMessage = "Не получилось скопировать код";
    }
  }

  function minutes(ms: number) {
    return Math.round(ms / 60_000);
  }

  $effect(() => {
    if (!browser) return;
    const overdue =
      remaining != null &&
      remaining <= 0 &&
      (state.phase === "collecting" || state.phase === "voting");
    if (overdue && !nudged) {
      nudged = true;
      void poll();
    }
    if (!overdue) nudged = false;
  });

  onMount(() => {
    mounted = true;
    clockOffset = state.serverNow - Date.now();
    const tick = setInterval(() => {
      nowTick = Date.now();
    }, 250);
    const pollId = setInterval(() => void poll(), 2000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      clearInterval(pollId);
      clearTimeout(copiedTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
</script>

<svelte:head>
  <title>{state.title} — Zuvlul</title>
</svelte:head>

<main class="container" class:with-start={state.me?.isHost && state.phase === "lobby"}>
  <div class="title-row">
    <h1>{state.title}</h1>
    {#if state.me?.isHost && state.phase === "collecting"}
      <button
        type="button"
        class="to-vote"
        disabled={pending || state.optionCount === 0}
        onclick={() => send({ action: "finish" })}
      >
        Перейти к голосованию
      </button>
    {/if}
    {#if state.me?.isHost && state.phase === "lobby"}
      <button
        type="button"
        class="start"
        disabled={pending}
        onclick={() => send({ action: "start" })}
      >
        Начать
      </button>
    {/if}
  </div>
  <p class="invite">
    <span>Код для входа в комнату:</span>
    <span class="code-chip">
      <span class="digits">{state.code}</span>
      <button
        type="button"
        aria-label={copied ? "Код скопирован" : "Скопировать код"}
        onclick={copyCode}
      >
        {#if copied}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        {/if}
      </button>
    </span>
  </p>
  {#if state.me && state.phase === "lobby"}
    <p>
      Добавление вариантов — {minutes(state.collectMs)} мин, голосование — {minutes(
        state.voteMs,
      )} мин.
      {modeLabel(state.mode)}. {scaleLabel(state.scale)}. Чужие варианты скрыты, пока их добавляют.
    </p>
  {:else}
    <p>
      {modeLabel(state.mode)}. {scaleLabel(state.scale)}.
      {#if state.phase === "collecting" || state.phase === "voting"}
        Вариантов: {state.optionCount}.
      {/if}
    </p>
  {/if}
  {#if mounted && remaining != null && (state.phase === "collecting" || state.phase === "voting")}
    <p><strong>Осталось {formatRemaining(remaining)}</strong></p>
  {:else if state.phaseEndsAt && (state.phase === "collecting" || state.phase === "voting")}
    <p>Общий таймер включён.</p>
  {/if}
  {#if errorMessage}<p role="alert">{errorMessage}</p>{/if}

  {#if !state.me}
    <article>
      <h2>Войти в комнату</h2>
      <p>
        {#if state.phase === "lobby"}Добавление вариантов ещё не началось.
        {:else if state.phase === "collecting"}Сейчас добавляют варианты.
        {:else if state.phase === "voting"}Идёт голосование.
        {:else}Итог уже есть.{/if}
        Имя будет в списке комнаты. Голос останется без имени.
      </p>
      <form onsubmit={join}>
        <label>
          Имя
          <input name="name" required maxlength="40" autocomplete="nickname" />
        </label>
        <button type="submit" disabled={pending}>Войти</button>
      </form>
    </article>
  {:else}
    {#if state.phase === "lobby" && !state.me.isHost}
      <p>Ждём старта</p>
    {/if}

    {#if state.names.length}
      <p class="roster">
        В комнате {state.participantCount} из {state.maxParticipants}
      </p>
      {#if state.phase === "lobby" && state.participantCount >= state.maxParticipants}
        <p class="full">Все на месте</p>
      {/if}
      <ul>
        {#each state.names as person, index (person.name + index)}
          <li>{person.name}{person.host ? " — владелец" : ""}</li>
        {/each}
      </ul>
    {/if}

    {#if state.phase === "collecting"}
      <article>
        <h2>Твои варианты</h2>
        <p>Остальные не видят их до общего голосования.</p>
        <form onsubmit={addOption}>
          <label>
            Название
            <input name="title" required maxlength="80" />
          </label>
          <label>
            Короткий текст
            <textarea name="note" maxlength="280" rows="3"></textarea>
          </label>
          <label>
            Ссылка
            <input name="link" type="url" placeholder="https://" />
          </label>
          <button type="submit" disabled={pending}>Добавить</button>
        </form>
        {#each state.myOptions as option (option.id)}
          <article>
            <header><strong>{option.title}</strong></header>
            {#if option.note}<p>{option.note}</p>{/if}
            {#if option.link}
              <p>
                <a href={option.link} target="_blank" rel="noreferrer"
                  >{option.link}</a
                >
              </p>
            {/if}
            <button
              type="button"
              class="secondary outline"
              disabled={pending}
              onclick={() => send({ action: "remove", optionId: option.id })}
            >
              Удалить
            </button>
          </article>
        {/each}
        <button
          type="button"
          class="done"
          class:outline={!state.me.ready}
          disabled={pending || (!state.me.ready && state.optionCount === 0)}
          onclick={() => send({ action: "ready" })}
        >
          Готово
        </button>
      </article>
    {/if}

    {#if state.phase === "voting"}
      <article>
        <h2>Голосование</h2>
        <p>
          Отметки без имён. Если время выйдет, пустая оценка считается как «не
          знаю», а не как отказ.
        </p>
        <button
          type="button"
          class:outline={!state.me.followsMajority}
          disabled={pending}
          onclick={() =>
            send({ action: "majority", on: !state.me.followsMajority })}
        >
          Мне подойдёт выбор большинства
        </button>
        {#if state.me.followsMajority}
          <p>
            Твоя отметка не сдвигает счёт. Ты присоединяешься к победителю
            остальных.
          </p>
        {/if}
      </article>

      {#each state.ballot as option (option.id)}
        {@render optionCard(option)}
      {/each}

      {#if state.me.isHost}
        <button
          type="button"
          disabled={pending}
          onclick={() => send({ action: "finish" })}
        >
          Завершить голосование
        </button>
      {/if}
    {/if}

    {#if state.phase === "results"}
      <h2>Итог</h2>
      {#if state.results}
        <p>{state.results.reason}</p>
        {@const ranked = state.results.ranking.filter(
          (row) => row.score != null && row.score > 0,
        )}
        {@const rows = state.results.winnerId
          ? ranked.slice(0, 3)
          : state.results.ranking}
        {#if state.results.winnerId && ranked.length > 3}
          <p><small>Показаны три лучших.</small></p>
        {/if}
        {#each rows as row, index (row.id)}
          <article>
            <header>
              <strong
                >{state.results.winnerId
                  ? `${index + 1}. `
                  : ""}{row.title}</strong
              >
              {#if row.id === state.results.winnerId}
                — победил{/if}
            </header>
            {#if row.authorName}<p>
                <small>Предложил {row.authorName}</small>
              </p>{/if}
            {#if row.note}<p>{row.note}</p>{/if}
            {#if isDirectImage(row.link)}
              <img src={row.link} alt="" referrerpolicy="no-referrer" />
            {/if}
            {#if row.link}
              <p>
                <a href={row.link} target="_blank" rel="noreferrer"
                  >{row.link}</a
                >
              </p>
            {/if}
            <p>
              {agreementPercent(row.score, state.mode)}
              {#if row.min != null}
                · {worstLabel(state.scale, row.min)}{/if}
              · {coverageLabel(row.coverage, state.results.decisiveVoters)}
            </p>
            {#if countEntries(state.scale, row.counts).length}
              <ul>
                {#each countEntries(state.scale, row.counts) as entry (entry.label)}
                  <li>{entry.label}: {entry.count}</li>
                {/each}
              </ul>
            {/if}
          </article>
        {:else}
          <p>Вариантов не было.</p>
        {/each}
      {/if}
    {/if}
  {/if}
</main>

{#snippet optionCard(option: BallotOption)}
  <article>
    <header><strong>{option.title}</strong></header>
    {#if option.authorName}<p>
        <small>Предложил {option.authorName}</small>
      </p>{/if}
    {#if option.note}<p>{option.note}</p>{/if}
    {#if isDirectImage(option.link)}
      <img src={option.link} alt="" referrerpolicy="no-referrer" />
    {/if}
    {#if option.link}
      <p>
        <a href={option.link} target="_blank" rel="noreferrer">{option.link}</a>
      </p>
    {/if}

    {#if state.scale === "score10"}
      <div class="scores">
        {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as score (score)}
          <button
            type="button"
            class:outline={option.mineRating !== String(score)}
            disabled={pending}
            onclick={() =>
              send({ action: "rate", optionId: option.id, value: String(score) })}
          >
            {score}
          </button>
        {/each}
      </div>
      {@render unknown(option)}
    {:else}
      <div class="marks" class:pair={state.scale === "yesno"}>
        {#each (state.scale === "yesno" ? YESNO_MARKS : TEXT_MARKS).filter((mark) => mark.value !== "skip") as mark (mark.value)}
          <button
            type="button"
            class:outline={option.mineRating !== mark.value}
            disabled={pending}
            onclick={() =>
              send({ action: "rate", optionId: option.id, value: mark.value })}
          >
            {mark.label}
          </button>
        {/each}
      </div>
      {@render unknown(option)}
    {/if}
  </article>
{/snippet}

{#snippet unknown(option: BallotOption)}
  <button
    type="button"
    class="unknown"
    class:outline={option.mineRating !== "skip"}
    disabled={pending}
    onclick={() => send({ action: "rate", optionId: option.id, value: "skip" })}
  >
    Не знаю
  </button>
{/snippet}

<style>
  .invite {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .code-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.1rem 0.15rem 0.1rem 0.55rem;
    border-radius: 0.4rem;
    background: var(--pico-code-background-color);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 1rem;
    letter-spacing: 0.06em;
  }

  .code-chip button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.7rem;
    height: 1.7rem;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: inherit;
    line-height: 0;
  }

  .code-chip svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .roster {
    margin-bottom: 0.25rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .full {
    margin-top: 0;
    margin-bottom: 0.75rem;
  }

  button.start {
    margin-bottom: 0;
  }

  .title-row .start,
  .title-row .to-vote {
    width: auto;
    margin: 0;
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .title-row h1 {
    margin-bottom: 0;
  }

  @media (max-width: 47.99rem) {
    .title-row .start {
      position: fixed;
      z-index: 5;
      bottom: calc(1rem + env(safe-area-inset-bottom));
      left: 50%;
      width: min(calc(100% - 2rem), 42rem);
      margin: 0;
      transform: translateX(-50%);
      box-shadow: 0 0.4rem 1.1rem rgb(0 0 0 / 28%);
    }

    main.with-start {
      padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
    }
  }

  button.done {
    width: 100%;
    margin-top: 0.5rem;
    margin-bottom: 0;
  }

  /* Compact equal cells. "Не знаю" stays on its own row, outside the scale. */
  .marks,
  .scores {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    max-width: 100%;
  }

  .marks button,
  .scores button,
  button.unknown {
    min-height: 2.25rem;
    margin-bottom: 0;
    padding: 0.35rem 0.55rem;
    font-size: 0.9rem;
    line-height: 1.2;
  }

  .marks button {
    flex: 1 1 calc((100% - 0.7rem) / 3);
    max-width: 8.5rem;
  }

  .marks.pair button {
    flex-basis: calc(50% - 0.2rem);
    max-width: 8.5rem;
  }

  .scores button {
    flex: 0 0 2.4rem;
    padding-inline: 0;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .unknown {
    width: auto;
    min-width: 7rem;
    margin-top: 0.5rem;
  }
</style>
