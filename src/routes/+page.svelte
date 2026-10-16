<script lang="ts">
  import { CUSTOM_SCALES, STANDARD_HINTS } from "#lib/scales";

  let { form }: { form: { createError?: string; joinError?: string } | null } =
    $props();
  let setup = $state("standard");
  let scale = $state("text");
</script>

<svelte:head>
  <title>Nandch</title>
</svelte:head>

<main class="container">
  <h1>Nandch</h1>
  <p>
    Помогает компании выбрать фильм, сериал, место, игру или что угодно ещё.
  </p>
  <p>
    Каждый добавляет варианты со своего телефона. Потом все ставят отметки.
    Голоса без имён, таймер общий. Сейчас в комнате от 1 до 6 человек.
  </p>

  <article>
    <h2>Новая комната</h2>
    {#if form?.createError}
      <p role="alert">{form.createError}</p>
    {/if}
    <form method="POST" action="?/create">
      <label>
        Что выбираете
        <input
          name="title"
          required
          maxlength="80"
          placeholder="Фильм на пятницу"
        />
      </label>
      <label>
        Твоё имя
        <input
          name="name"
          required
          maxlength="40"
          autocomplete="nickname"
          placeholder="Арман"
        />
        <small
          >Имя видно в списке комнаты. Кто какой вариант добавил и как голосовал
          — не видно.</small
        >
      </label>
      <div class="grid">
        <label>
          Минуты на сбор
          <input
            name="collectMinutes"
            type="number"
            min="1"
            max="180"
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
            max="180"
            value="3"
            required
          />
        </label>
      </div>

      <fieldset>
        <legend>Как оцениваем</legend>
        <label>
          <input
            type="radio"
            name="setup"
            value="standard"
            bind:group={setup}
          />
          Стандарт
        </label>
        <p>
          Одна настройка на привычные компании. Шкала: от «точно нет» до «точно
          да», плюс «не знаю».
        </p>
        <ul>
          {#each STANDARD_HINTS as hint (hint.title)}
            <li><strong>{hint.title}.</strong> {hint.text}</li>
          {/each}
        </ul>
        <label>
          <input type="radio" name="setup" value="custom" bind:group={setup} />
          Своя шкала
        </label>
      </fieldset>

      {#if setup === "custom"}
        <fieldset>
          <legend>Шкала</legend>
          {#each CUSTOM_SCALES as item (item.id)}
            <label>
              <input
                type="radio"
                name="scale"
                value={item.id}
                bind:group={scale}
              />
              <strong>{item.title}.</strong>
              {item.text}
            </label>
          {/each}
          <p>
            Позже сюда добавятся другие шкалы. Для подсчёта любая сводится к
            числу от 0 до 1.
          </p>
        </fieldset>
      {/if}

      <button type="submit">Создать комнату</button>
    </form>
  </article>

  <article>
    <h2>Войти по коду</h2>
    {#if form?.joinError}
      <p role="alert">{form.joinError}</p>
    {/if}
    <form method="POST" action="?/join">
      <label>
        Код
        <input
          name="code"
          required
          minlength="6"
          maxlength="6"
          autocapitalize="characters"
        />
      </label>
      <label>
        Твоё имя
        <input name="name" required maxlength="40" autocomplete="nickname" />
      </label>
      <button type="submit">Войти</button>
    </form>
  </article>
</main>
