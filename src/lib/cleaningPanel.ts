export type CleaningField = "finished_at" | "mode" | "started_at" | "duration" | "battery_start" | "battery_end";

export const CLEANING_FIELDS: CleaningField[] = ["finished_at", "mode", "started_at", "duration", "battery_start", "battery_end"];

const MODE_LABELS: Record<string, string> = {
    vacuum: "Vacuum only",
    mop: "Mop only",
    vacuum_and_mop: "Vacuum and mop",
    vacuum_then_mop: "Vacuum then mop"
};

export function cleaningRows(attributes: Record<string, unknown>, fields: CleaningField[], locale?: string): [string, string][] {
    const labels: Record<CleaningField, string> = {
        finished_at: "Last cleaned", mode: "Mode", started_at: "Started",
        duration: "Duration", battery_start: "Battery at start", battery_end: "Battery at finish"
    };
    return fields.map(field => {
        const value = attributes[field];
        let formatted = "Unknown";
        if (field === "mode" && typeof value === "string") {
            formatted = MODE_LABELS[value] || value;
        } else if ((field === "started_at" || field === "finished_at") && typeof value === "string") {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                formatted = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
            }
        } else if (typeof value === "number" && isFinite(value) && value >= 0 && (field === "duration" || value <= 100)) {
            formatted = field === "duration" ?
                `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 60)} min` :
                `${new Intl.NumberFormat(locale).format(value)}%`;
        }
        return [labels[field], formatted];
    });
}

export function createModeControl(
    document: Document,
    entity: { state: string; attributes: Record<string, unknown> } | undefined,
    entityId: string,
    callService: (domain: string, service: string, data: Record<string, string>) => Promise<unknown>
): HTMLElement {
    const container = document.createElement("div");
    container.className = "cleaning-mode";
    const label = document.createElement("label");
    label.textContent = "Cleaning mode ";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Cleaning mode");
    const options = entity?.attributes.options;
    const available = entity && !["unavailable", "unknown"].includes(entity.state) && Array.isArray(options);
    const values: string[] = available ? options.filter((option): option is string => {
        return typeof option === "string";
    }) : [];
    values.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = MODE_LABELS[value] || value;
        select.appendChild(option);
    });
    select.value = entity?.state || "";
    select.disabled = !available || values.length === 0;
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    if (select.disabled) {
        status.textContent = `Cleaning mode unavailable. Check ${entityId}.`;
    }
    let confirmed = entity?.state || "";
    select.addEventListener("change", async () => {
        const previous = confirmed;
        const option = select.value;
        select.disabled = true;
        status.textContent = "Saving…";
        try {
            await callService("select", "select_option", { entity_id: entityId, option });
            confirmed = option;
            status.textContent = "";
        } catch {
            select.value = previous;
            status.textContent = "Could not change cleaning mode. Try again.";
        } finally {
            select.disabled = false;
        }
    });
    label.appendChild(select);
    container.append(label, status);
    return container;
}
