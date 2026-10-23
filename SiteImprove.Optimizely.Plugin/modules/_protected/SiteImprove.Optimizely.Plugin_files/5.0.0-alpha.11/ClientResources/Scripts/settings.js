(function () {
    "use strict";
    var form = document.querySelector("[data-siteimprove-mappings]");
    if (!form) return;
    var rows = form.querySelector("#mapping-rows");
    var template = form.querySelector("#mapping-template");
    var add = form.querySelector("#add-mapping");
    var status = form.querySelector("#mapping-status");

    function markChanged(message) {
        var saved = document.querySelector(".settings-saved");
        if (saved) saved.hidden = true;
        status.textContent = message || "You have unsaved changes.";
    }

    function renumber() {
        Array.from(rows.children).forEach(function (row, index) {
            ["Key", "Value"].forEach(function (field) {
                var input = row.querySelector('[data-mapping-field="' + field + '"]');
                var error = row.querySelector('[data-mapping-error="' + field + '"]');
                var errorId = "mapping-" + (field === "Key" ? "source" : "target") + "-error-" + index;
                input.name = "urlMap[" + index + "]." + field;
                input.id = "urlMap_" + index + "__" + field;
                input.setAttribute("aria-label", (field === "Key" ? "CMS" : "Public") + " origin, row " + (index + 1));
                input.setAttribute("aria-describedby", "mapping-help " + errorId);
                error.id = errorId;
                var validation = error.querySelector("[data-valmsg-for]");
                if (validation) validation.setAttribute("data-valmsg-for", input.name);
            });
            row.querySelector("[data-remove-mapping]").setAttribute("aria-label", "Remove mapping row " + (index + 1));
        });
    }

    add.addEventListener("click", function () {
        rows.appendChild(template.content.cloneNode(true));
        renumber();
        rows.lastElementChild.querySelector("input").focus();
        markChanged("Mapping row added. Save settings to keep your changes.");
    });
    rows.addEventListener("click", function (event) {
        var remove = event.target.closest("[data-remove-mapping]");
        if (!remove) return;
        var row = remove.closest("[data-mapping-row]");
        var index = Array.from(rows.children).indexOf(row);
        row.remove();
        renumber();
        var next = rows.children[Math.min(index, rows.children.length - 1)];
        (next ? next.querySelector("[data-remove-mapping]") : add).focus();
        markChanged("Mapping row removed. Save settings to keep your changes.");
    });
    form.addEventListener("input", function () { markChanged(); });
    form.addEventListener("submit", renumber);
    renumber();
}());
