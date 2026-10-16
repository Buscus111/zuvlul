<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { agreementPercent, countEntries, coverageLabel, worstLabel } from "#lib/format";
  import {
    TEXT_MARKS,
    YESNO_MARKS,
    formatRemaining,
    isDirectImage,
    scaleLabel,
  } from "#lib/scales";
  import type { BallotOption, PublicState } from "#lib/types";

  let { data } = $props();
  let local = $state<PublicState | null>(null);
  let state = $derived(local ?? data.state);
  let errorMessage = $state("");
  let pending = $state(false);
  let copied = $state(false);
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
          typeof payload.error === "string" ? payload.error : "Не получилось сохранить";
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

  async function copyLink() {
    await navigator.clipboard.writeText(`${location.origin}/r/${state.code}`);
    copied = true;
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
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
</script>

<svelte:head>
  <title>{state.title} — Nandch</title>
</svelte:head>

<main class="container">
  <p><a href="/">Nandch</a></p>
  <h1>{state.title}</h1>
  <p>
    Код <kbd>{state.code}</kbd>
    <button type="button" class="outline" onclick={copyLink}>Скопировать ссылку</button>
  </p>
  {#if copied}<p>Ссылка скопирована.</p>{/if}
  <p>
    {scaleLabel(state.scale)}. В комнате {state.participantCount} из {state.maxParticipants}.
    {#if state.phase === "collecting" || state.phase === "voting"}
      Вариантов: {state.optionCount}.
    {/if}
  </p>
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
        {#if state.phase === "lobby"}Сбор ещё не начался.
        {:else if state.phase === "collecting"}Идёт сбор вариантов.
        {:else if state.phase === "voting"}Идёт голосование.
        {:else}Итог уже есть.{/if}
        Имя будет в списке комнаты. Голос останется без имени.
      </p>
      <form onsubmit={join}>
        <label>
          Твоё имя
          <input name="name" required maxlength="40" autocomplete="nickname" />
        </label>
        <button type="submit" disabled={pending}>Войти</button>
      </form>
    </article>
  {:else}
    {#if state.names.length}
      <ul>
        {#each state.names as person, index (person.name + index)}
          <li>{person.name}{person.host ? " — хозяин" : ""}</li>
        {/each}
      </ul>
    {/if}

    {#if state.phase === "lobby"}
      <article>
        <h2>Ждём старт</h2>
        <p>
          На сбор {minutes(state.collectMs)} мин, на голосование {minutes(state.voteMs)} мин. Чужие
          варианты скрыты до конца сбора.
        </p>
        {#if state.me.isHost}
          <button type="button" disabled={pending} onclick={() => send({ action: "start" })}>
            Начать сбор
          </button>
        {:else}
          <p>Хозяин комнаты запустит сбор.</p>
        {/if}
      </article>
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
              <p><a href={option.link} target="_blank" rel="noreferrer">{option.link}</a></p>
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
        <button type="button" class="outline" disabled={pending} onclick={() => send({ action: "ready" })}>
          {state.me.ready ? "Я ещё добавлю" : "Я всё добавил"}
        </button>
        {#if state.me.isHost}
          <button type="button" disabled={pending} onclick={() => send({ action: "finish" })}>
            Перейти к голосованию
          </button>
        {/if}
      </article>
    {/if}

    {#if state.phase === "voting"}
      <article>
        <h2>Голосование</h2>
        <p>
          Отметки без имён. Если время выйдет, пустая оценка считается как «не знаю», а не как отказ.
        </p>
        <button
          type="button"
          class:outline={!state.me.followsMajority}
          disabled={pending}
          onclick={() => send({ action: "majority", on: !state.me.followsMajority })}
        >
          Мне подойдёт выбор большинства
        </button>
        {#if state.me.followsMajority}
          <p>Твоя отметка не сдвигает счёт. Ты присоединяешься к победителю остальных.</p>
        {/if}
      </article>

      {#each state.ballot as option (option.id)}
        {@render optionCard(option)}
      {/each}

      {#if state.me.isHost}
        <button type="button" disabled={pending} onclick={() => send({ action: "finish" })}>
          Завершить голосование
        </button>
      {/if}
    {/if}

    {#if state.phase === "results"}
      <h2>Итог</h2>
      {#if state.results}
        <p>{state.results.reason}</p>
        {#each state.results.ranking as row, index (row.id)}
          <article>
            <header>
              <strong>{index + 1}. {row.title}</strong>
              {#if row.id === state.results.winnerId} — победил{/if}
            </header>
            {#if row.note}<p>{row.note}</p>{/if}
            {#if isDirectImage(row.link)}
              <img src={row.link} alt="" referrerpolicy="no-referrer" />
            {/if}
            {#if row.link}
              <p><a href={row.link} target="_blank" rel="noreferrer">{row.link}</a></p>
            {/if}
            <p>
              {agreementPercent(row.score)}
              {#if row.min != null} · {worstLabel(state.scale, row.min)}{/if}
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
    {#if option.note}<p>{option.note}</p>{/if}
    {#if isDirectImage(option.link)}
      <img src={option.link} alt="" referrerpolicy="no-referrer" />
    {/if}
    {#if option.link}
      <p><a href={option.link} target="_blank" rel="noreferrer">{option.link}</a></p>
    {/if}

    {#if state.scale === "score10"}
      <label>
        Оценка
        <select
          value={option.mineRating ?? ""}
          disabled={pending}
          onchange={(event) => {
            const value = event.currentTarget.value;
            if (value) void send({ action: "rate", optionId: option.id, value });
          }}
        >
          <option value="" disabled>Выбери оценку</option>
          {#each [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] as score (score)}
            <option value={String(score)}>{score}</option>
          {/each}
          <option value="skip">Не знаю</option>
        </select>
      </label>
    {:else}
      <div role="group">
        {#each state.scale === "yesno" ? YESNO_MARKS : TEXT_MARKS as mark (mark.value)}
          <button
            type="button"
            class:outline={option.mineRating !== mark.value}
            disabled={pending}
            onclick={() => send({ action: "rate", optionId: option.id, value: mark.value })}
          >
            {mark.label}
          </button>
        {/each}
      </div>
    {/if}
  </article>
{/snippet}
