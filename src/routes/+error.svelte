<script lang="ts">
  import { page } from "$app/state";
</script>

<main class="container">
  <h1>{page.status}</h1>
  <p>{page.error?.message ?? "Что-то пошло не так"}</p>
  <p><a href="/">На главную</a></p>
</main>
