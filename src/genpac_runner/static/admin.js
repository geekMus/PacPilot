document.addEventListener("DOMContentLoaded", function () {
  const mode = document.getElementById("startup_mode");
  const genpacFields = document.getElementById("genpac-fields");
  const customRules = document.getElementById("custom-rules");
  const filter = document.getElementById("rule-filter");

  function syncMode() {
    if (!mode) return;
    const custom = mode.value === "custom";
    if (genpacFields) genpacFields.classList.toggle("hidden", custom);
    if (customRules) customRules.classList.toggle("hidden", !custom);
  }
  if (mode) {
    mode.addEventListener("change", syncMode);
    syncMode();
  }

  if (filter) {
    filter.addEventListener("input", function () {
      const query = filter.value.trim().toLowerCase();
      document.querySelectorAll(".rule-item").forEach(function (item) {
        item.classList.toggle("hidden", !item.dataset.rule.includes(query));
      });
    });
  }
});
