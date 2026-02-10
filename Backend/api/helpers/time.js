const moment = require('moment-timezone');


function getCurrentDateTime() {
  // Get the current time in the 'Asia/Tashkent' time zone
  const timeInTashkent = moment().tz('Asia/Samarkand');

  // Add 4 hours to the current time
  const futureTimeInTashkent = timeInTashkent.add(5, 'hours');

  // Convert the result to a JavaScript Date object
  const dateInTashkent = futureTimeInTashkent.toDate();

  return dateInTashkent;
}

const getDateString = (data, format) => {
  if (data === null) {
    return 'Kritilmagan'
  }
  const date = new Date(data);
  const year = date.getFullYear().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

const formatRussianDateTime = () => {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  const now = new Date();
  const day = now.getDate();
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  return `${day} ${month} ${year} года в ${hours}:${minutes}`;
};

const getDateDayString = (data) => {
  if (data === null) {
    return 'Kritilmagan'
  }
  const date = new Date(data);
  const year = date.getFullYear().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const getDateStringWithFormat = (data, format) => {
  if (data === null) {
    return 'Kritilmagan'
  }

  const date = new Date(data);
  const year = date.getFullYear().toString().padStart(2, '0');
  if (format === "year") {
    return `${year}`;
  }
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  if (format === "month") {
    return `${year}-${month}`;
  }
  const day = date.getDate().toString().padStart(2, '0');
  if (format === "day") {
    return `${year}-${month}-${day}`;
  }
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  if (format === "hour") {
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
  if (format === "minute") {
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
  if (format === "format") {
    return `${day}${month}${year}`;
  }
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
//request limitter
module.exports = { getCurrentDateTime, getDateString, getDateDayString, getDateStringWithFormat, formatRussianDateTime };