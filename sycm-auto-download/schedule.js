// 日历日期使用北京时间，避免跨时区及夏令时影响。
function sycmSchedule(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  const today = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
  const day = offset => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const weekday = get('weekday');
  const count = { Mon: 4, Tue: 1, Wed: 2, Thu: 3, Fri: 1, Sat: 2, Sun: 3 }[weekday];
  const daily = Array.from({ length: count }, (_, i) => ({ start: day(i - count), end: day(i - count) }));
  return {
    today: day(0),
    dailyDates: daily.map(range => range.end),
    product: daily[0],
    traffic: daily[0],
    productDays: daily.map(range => ({ ...range })),
    trafficDays: daily.map(range => ({ ...range })),
    search: weekday === 'Mon' ? { start: day(-7), end: day(-1) } : null,
    content: weekday === 'Thu' ? { start: day(-3), end: day(-1) } :
      weekday === 'Mon' ? { start: day(-4), end: day(-1) } : null
  };
}
if (typeof module !== 'undefined') module.exports = { sycmSchedule };
