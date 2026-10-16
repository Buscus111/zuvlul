<script lang="ts">
  import { CHOICE_MODES } from "#lib/scales";

  let { form }: { form: { createError?: string; joinError?: string } | null } =
    $props();
  let mode = $state("diverse");
</script>

<svelte:head>
  <title>Zuvlul</title>
</svelte:head>

<main class="container">
  <div class="split">
    <article>
      <h2>Войти по коду</h2>
      {#if form?.joinError}
        <p role="alert">{form.joinError}</p>
      {/if}
      <form class="room-form" method="POST" action="?/join">
        <div class="group">
          <label>
            Код
            <input
              name="code"
              required
              minlength="6"
              maxlength="6"
              autocapitalize="characters"
              autocomplete="off"
            />
          </label>
          <label>
            Имя
            <input name="name" required maxlength="40" autocomplete="nickname" />
          </label>
        </div>
        <button type="submit">Войти</button>
      </form>
    </article>

    <article>
      <h2>Новая комната</h2>
      {#if form?.createError}
        <p role="alert">{form.createError}</p>
      {/if}
      <form class="room-form" method="POST" action="?/create">
        <div class="group">
          <label>
            Тема
            <input
              name="title"
              required
              maxlength="80"
              placeholder="Фильм на пятницу"
            />
          </label>
          <label>
            Имя
            <input
              name="name"
              required
              maxlength="40"
              autocomplete="nickname"
              placeholder="Арман"
            />
          </label>
        </div>

        <div class="group times">
          <label>
            Минуты на варианты
            <input
              name="collectMinutes"
              type="number"
              min="1"
              max="30"
              value="5"
              required
            />
          </label>
          <label>
            Минуты на голосование
            <input
              name="voteMinutes"
              type="number"
              min="1"
              max="30"
              value="3"
              required
            />
          </label>
          <label>
            Участников
            <input name="seats" type="number" min="2" max="10" value="4" required />
          </label>
        </div>

        <fieldset class="group">
          <legend>Какие варианты</legend>
          {#each CHOICE_MODES as item (item.id)}
            <label>
              <input type="radio" name="mode" value={item.id} bind:group={mode} />
              <strong>{item.title}.</strong>
              {item.text}
            </label>
          {/each}
        </fieldset>

        <label class="authors">
          <input type="checkbox" name="showAuthors" />
          Показывать, кто предложил вариант
        </label>

        <button type="submit">Создать комнату</button>
      </form>
    </article>
  </div>
</main>

<style>
  .split {
    display: grid;
    gap: 1rem;
    align-items: start;
  }

  form > button {
    margin-bottom: 0;
  }

  .room-form {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .room-form label,
  .room-form fieldset,
  .room-form p,
  .room-form ul {
    margin-bottom: 0;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .times {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.85rem;
    align-items: stretch;
  }

  .times > label {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
    min-width: 0;
  }

  .room-form fieldset.group {
    gap: 0.65rem;
  }

  @media (min-width: 40rem) {
    .times {
      grid-template-columns: 1fr 1fr 1fr;
    }
  }

  @media (min-width: 42rem) {
    .split {
      grid-template-columns: minmax(12.5rem, 16rem) minmax(0, 1fr);
    }
  }
</style>
