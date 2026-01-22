export function formatToTimeEst(dateInput: string | number | Date): string {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "";

    // Format: HH:mm (e.g., 14:30)
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

export function formatToDateEst(dateInput: string | number | Date): string {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "";

    // Format: dd MMM HH:mm (e.g., 22 Jan 14:30)
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

// For chart axes where we might want just time if it's today
export function smartFormatEst(dateInput: string | number | Date): string {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    // Use EST 'now' just to be safe if strictly comparing days in EST, 
    // but for simple "is it today" check, local browser time usually suffices for UI.
    // However, strictly:
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const estDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));

    // If same day
    if (estNow.toDateString() === estDate.toDateString()) {
        return formatToTimeEst(date);
    }
    return formatToDateEst(date);
}
