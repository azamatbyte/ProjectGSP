export const getDateString = (data, format) => {
    if (data === null) {
        return "";
    }
    const date = new Date(data);
    const year = date.getFullYear().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hour = date.getHours().toString().padStart(2, "0");
    const minute = date.getMinutes().toString().padStart(2, "0");
    return `${day}.${month}.${year} ${hour}:${minute}`;
};

export const getDateDayString = (data) => {
    if (data === null) {
        return "";
    }

    if (typeof data === "string") {
        data = data.split("T")[0];
        data = data.split("-").reverse().join(".");
        return data;
    }
    const date = new Date(data);
    const year = date.getFullYear().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${day}.${month}.${year}`;
};

export const getDateDayStringRelative = (data) => {
    if (!data) return "";

    const date = new Date(data);

    if (isNaN(date.getTime())) return "";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}.${month}.${year}`;
};
