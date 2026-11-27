(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    months = [
      "январь",
      "февраль",
      "март",
      "апрель",
      "май",
      "июнь",
      "июль",
      "август",
      "сентябрь",
      "октябрь",
      "ноябрь",
      "декабрь",
    ],
    days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  // Calendar dates are UTC-backed wall-clock values for Moscow (UTC+03).
  const moscowDate = (instant = Date.now()) =>
    new Date(new Date(instant).getTime() + 3 * 3600000);
  const moscowInstant = (wall) => new Date(wall + "+03:00");
  let view = moscowDate(),
    analyticsDate = moscowDate();
  let bookings = {},
    rates = Object.create(null);
  let activeKey = null,
    admin = false;
  const dateKey = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const key = (d, h) => `${d}T${String(h).padStart(2, "0")}:00`;
  const money = (n) =>
    "₽" +
    Number(n || 0).toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  const monthLabel = (d) => months[d.getUTCMonth()] + " " + d.getUTCFullYear();
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  let unpaidMode = false;
  function overdue(b) {
    return (
      b.payment !== "paid" &&
      moscowInstant(b.start).getTime() + b.duration * 3600000 <= Date.now()
    );
  }
  function debts() {
    return [
      ...new Map(Object.values(bookings).map((b) => [b.start, b])).values(),
    ]
      .filter(overdue)
      .sort((a, b) => a.start.localeCompare(b.start));
  }
  function jumpDebt() {
    let b = debts()[0];
    if (b) {
      view = new Date(b.start + "Z");
      analyticsDate = new Date(
        Date.UTC(view.getUTCFullYear(), view.getUTCMonth(), 1),
      );
      renderCalendar();
      renderAdmin();
      $("ownerCalendar").scrollIntoView({ block: "nearest" });
    } else {
      unpaidMode = false;
      renderAdmin();
    }
  }
  $("unpaidBtn").onclick = () => {
    unpaidMode = true;
    jumpDebt();
  };
  $("recordsToggle").onclick = () => {
    let p = $("recordsPanel");
    p.hidden = !p.hidden;
    $("recordsToggle").textContent =
      (p.hidden ? "▸" : "▾") + " Все бронирования и оплата";
    $("recordsToggle").setAttribute("aria-expanded", String(!p.hidden));
  };
  function renderCalendar() {
    drawCalendar("calendar", "monthTitle");
    drawCalendar("ownerCalendar", "ownerWeek");
  }
  function monday(d) {
    let x = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  }
  function renderWeekNav(title, start, end) {
    const host = $(title);
    host.replaceChildren();
    const label = document.createElement("span");
    label.className = "month-caption";
    const fmt = (d) =>
      d.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      });
    label.textContent =
      fmt(start) +
      (start.getUTCFullYear() !== end.getUTCFullYear()
        ? " " + start.getUTCFullYear()
        : "") +
      " — " +
      fmt(end) +
      " " +
      end.getUTCFullYear();
    host.append(label);

    label.setAttribute("role", "button");
    label.tabIndex = 0;
    label.setAttribute(
      "aria-expanded",
      String(!!document.getElementById("adminDatePopup")),
    );
    label.style.cursor = "pointer";
    label.title = "Выбрать дату";
    label.onclick = () => {
      if (document.getElementById("adminDatePopup")) {
        closeAdminDate();
        return;
      }
      openAdminDate(label);
    };
    label.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        label.click();
      }
    };
  }
  function closeAdminDate() {
    document.getElementById("adminDatePopup")?.remove();
    document
      .querySelectorAll("#ownerWeek .month-caption,#monthTitle .month-caption")
      .forEach((el) => el.setAttribute("aria-expanded", "false"));
  }
  function openAdminDate(label) {
    let month = new Date(
      Date.UTC(view.getUTCFullYear(), view.getUTCMonth(), 1),
    );
    const popup = document.createElement("div");
    popup.id = "adminDatePopup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Выбор даты");
    document.body.append(popup);
    label.setAttribute("aria-expanded", "true");
    function draw() {
      popup.replaceChildren();
      const top = document.createElement("div");
      top.className = "mini-top";
      const make = (text, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.onclick = (e) => {
          e.stopPropagation();
          fn();
        };
        return b;
      };
      const caption = document.createElement("span");
      caption.textContent = month.toLocaleDateString("ru-RU", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
      top.append(
        make("‹", () => {
          month.setUTCMonth(month.getUTCMonth() - 1);
          draw();
        }),
        caption,
        make("›", () => {
          month.setUTCMonth(month.getUTCMonth() + 1);
          draw();
        }),
      );
      popup.append(top);
      const grid = document.createElement("div");
      grid.className = "mini-grid";
      for (const d of ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]) {
        const h = document.createElement("span");
        h.textContent = d;
        grid.append(h);
      }
      const first = monday(month);
      for (let i = 0; i < 42; i++) {
        const d = new Date(first);
        d.setUTCDate(first.getUTCDate() + i);
        const b = make(String(d.getUTCDate()), () => {
          view = d;
          closeAdminDate();
          renderCalendar();
        });
        b.setAttribute("aria-label", dateKey(d));
        if (d.getUTCMonth() !== month.getUTCMonth()) b.classList.add("outside");
        if (dateKey(monday(d)) === dateKey(monday(view)))
          b.classList.add("selected");
        if (dateKey(d) === dateKey(moscowDate())) b.classList.add("today");
        grid.append(b);
      }
      popup.append(grid);
      if (!popup.style.left) {
        const anchor = label.isConnected
          ? label
          : document.querySelector(
              "#" + label.parentElement?.id + " .month-caption",
            );
        const r = (anchor || label).getBoundingClientRect();
        popup.style.left =
          Math.max(
            8,
            Math.min(
              innerWidth - popup.offsetWidth - 8,
              r.left + r.width / 2 - popup.offsetWidth / 2,
            ),
          ) + "px";
        popup.style.top =
          Math.max(
            8,
            Math.min(innerHeight - popup.offsetHeight - 8, r.bottom + 8),
          ) + "px";
      }
    }
    draw();
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#adminDatePopup,#ownerWeek,#monthTitle"))
      closeAdminDate();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAdminDate();
  });
  window.addEventListener("resize", closeAdminDate);
  window.addEventListener("scroll", closeAdminDate, true);
  function moveMonth(delta) {
    closeAdminDate();
    view = monday(view);
    view.setUTCDate(view.getUTCDate() + delta * 7);
    renderCalendar();
  }
  const stampObservers = new Map();

  function observeStamps(calendar, checks) {
    stampObservers.get(calendar)?.disconnect();
    stampObservers.delete(calendar);
    if (!checks.size) return;

    const checkLayout = () => {
      // Collect every layout read before writing visibility changes.
      const results = [...checks.values()].map((measure) => measure());
      for (const { stamp, visibility } of results) {
        if (stamp.style.visibility !== visibility)
          stamp.style.visibility = visibility;
      }
    };

    if (typeof ResizeObserver === "undefined") {
      requestAnimationFrame(checkLayout);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const results = entries.map(({ target }) => checks.get(target)());
      for (const { stamp, visibility } of results) {
        if (stamp.style.visibility !== visibility)
          stamp.style.visibility = visibility;
      }
    });
    stampObservers.set(calendar, observer);
    for (const inner of checks.keys()) observer.observe(inner);
  }

  function drawCalendar(id, title) {
    const owner = id === "ownerCalendar",
      start = monday(view),
      end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const count = 7;
    renderWeekNav(title, start, end);
    const cal = $(id),
      grid = document.createDocumentFragment(),
      today = dateKey(moscowDate());
    const week = Array.from({ length: count }, (_, offset) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + offset);
      return { date, key: dateKey(date) };
    });
    let occupied = 0,
      stampIndex = 0;
    const stampChecks = new Map();
    cal.style.gridTemplateColumns = `72px repeat(${count},minmax(82px,1fr))`;
    cal.style.minWidth = `${72 + count * 95}px`;
    const corner = document.createElement("div");
    corner.className = "dayhead";
    corner.style.gridArea = "1/1";
    grid.append(corner);
    for (let i = 0; i < count; i++) {
      const { date: d, key: dayKey } = week[i];
      let el = document.createElement("div");
      el.className =
        "dayhead" +
        (d.getUTCDay() === 6
          ? " saturday"
          : d.getUTCDay() === 0
            ? " sunday"
            : "");
      if (dayKey === today) el.classList.add("today");
      el.style.gridArea = `1/${i + 2}`;
      el.innerHTML = days[(d.getUTCDay() + 6) % 7] + `<b>${d.getUTCDate()}</b>`;
      grid.append(el);
    }
    for (let h = 9; h < 24; h++) {
      let t = document.createElement("div");
      t.className = "time";
      t.style.gridArea = `${h - 7}/1`;
      t.textContent = String(h).padStart(2, "0") + ":00";
      grid.append(t);
      for (let i = 0; i < count; i++) {
        let k = key(week[i].key, h),
          b = bookings[k];
        if (b) {
          occupied++;
          if (b.start !== k && h !== 9) continue;
        }
        let cell = document.createElement("div");
        cell.className =
          "slot" +
          (b ? " booked" : "") +
          (owner && b && overdue(b) ? " overdue" : "");
        cell.style.gridColumn = i + 2;
        cell.style.gridRow = `${h - 7} / span ${b ? Math.min(24 - h, b.duration - Math.max(0, h - Number(b.start.slice(11, 13)))) : 1}`;
        let inner = document.createElement("div");
        inner.className = "inner";
        inner.textContent = b ? b.group : String(h).padStart(2, "0") + ":00";
        if (b) {
          inner.replaceChildren();
          const name = document.createElement("span"),
            time = document.createElement("span");
          name.className = "booking-name";
          name.textContent = b.group;
          time.className = "booking-time";
          time.textContent =
            b.start.slice(11, 16) +
            "–" +
            String(Number(b.start.slice(11, 13)) + b.duration).padStart(
              2,
              "0",
            ) +
            ":00";
          inner.append(name, time);
          stampChecks.set(inner, addBookingStamp(inner, b, stampIndex++));
        }
        if (!b) {
          const past = moscowInstant(k).getTime() <= Date.now();
          if (past) cell.classList.add("past");
          cell.title = past ? "Прошедшее время" : "Свободно — забронировать";
          cell.setAttribute("aria-label", cell.title + " " + k);
        }
        if (b && !owner && own(b)) {
          inner.title = "Ваша запись — можно изменить или отменить";
          inner.style.outline = "1px dashed #555";
        }
        if (b) {
          let hash = Array.from(b.group).reduce(
            (a, c) => (a * 31 + c.charCodeAt(0)) >>> 0,
            0,
          );
          inner.style.backgroundColor =
            groupColors[b.group] || `hsl(${hash % 360} 55% 85%)`;
          inner.style.borderColor =
            groupColors[b.group] || `hsl(${hash % 360} 40% 65%)`;
          inner.style.setProperty("--group-color", inner.style.borderColor);
          if (owner && b.payment === "paid") {
            let mark = document.createElement("span");
            mark.className = "paidmark";
            mark.textContent = "✓";
            mark.title = "Оплачено";
            inner.append(mark);
          }
        }
        cell.append(inner);
        cell.onclick = () => {
          if (
            !(owner && admin) &&
            ((b && !own(b)) || (!b && moscowInstant(k).getTime() <= Date.now()))
          )
            return;
          openModal(k, b, owner && admin);
        };
        grid.append(cell);
      }
    }
    cal.replaceChildren(grid);
    observeStamps(cal, stampChecks);
    cal.setAttribute("aria-busy", String(!ready));
    if (owner)
      $("weekFree").textContent = "Свободно: " + (count * 15 - occupied) + " ч";
  }

  const stampArt = [
    "./assets/booking-stamp-01.png",
    "./assets/booking-stamp-02.png",
    "./assets/booking-stamp-03.png",
    "./assets/booking-stamp-04.png",
    "./assets/booking-stamp-05.png",
    "./assets/booking-stamp-06.png",
    "./assets/booking-stamp-07.png",
    "./assets/booking-stamp-08.png",
    "./assets/booking-stamp-09.png",
    "./assets/booking-stamp-10.png",
  ];
  function addBookingStamp(inner, b, index) {
    let seed = 2166136261;
    for (const ch of String(b.id || b.start + b.group)) {
      seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    }
    function rnd() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const short = b.duration === 1;
    inner.dataset.short = short ? "1" : "0";
    const art = stampArt[Math.floor(rnd() * stampArt.length)],
      angle = rnd() * 360,
      scale = 0.8 + rnd() * 0.35,
      opacity = 0.72 + rnd() * 0.25;
    const u = rnd(),
      v = rnd();
    // Preserve the existing stamp positions while skipping unused coordinate pairs.
    for (let i = 0; i < 198; i++) rnd();
    const stamp = document.createElement("span");
    stamp.className = "booking-stamp";
    stamp.setAttribute("aria-hidden", "true");
    stamp.style.maskImage = stamp.style.webkitMaskImage = 'url("' + art + '")';
    stamp.style.setProperty("--stamp-angle", angle + "deg");
    stamp.style.setProperty("--stamp-opacity", opacity);
    inner.append(stamp);
    // Stable normalized coordinates, independent of viewport and browser zoom.
    const clipped = index % 3 === 0;
    const x = short ? 0.84 + u * 0.06 : 0.22 + u * 0.66;
    const y = short ? 0.5 : 0.56 + v * 0.35;
    const hours = Math.max(1, Number(b.duration) || 1);
    const widthFactor = short ? 0.28 : Math.min(0.94, 0.42 + 0.085 * hours),
      heightFactor = short ? 0.88 : 0.64;
    const sizeScale = short ? scale : 0.82 + (scale - 0.8) * 1.65;
    // Half of intentionally clipped multi-hour stamps use two edges.
    const corner = clipped && !short && rnd() < 0.5;
    const edge = short
      ? "right"
      : corner
        ? ["bottom-left", "bottom-right", "top-right"][Math.floor(rnd() * 3)]
        : ["right", "bottom", "left"][Math.floor(rnd() * 3)];
    const desktopSize = clipped
      ? `min(${widthFactor * sizeScale * 100}cqw, ${Math.min(0.94, heightFactor * sizeScale) * 100}cqh)`
      : `min(${Math.min(widthFactor * sizeScale, Math.min(x, 1 - x) * 2) * 100}cqw, ${Math.min(heightFactor * sizeScale, Math.min(y, 1 - y) * 2) * 100}cqh)`;
    inner.style.setProperty("--desktop-stamp-size", desktopSize);
    const mobileFactor = short
      ? 0.3
      : hours === 2
        ? 0.55
        : hours === 3
          ? 0.7
          : hours <= 5
            ? 0.8
            : 0.9;
    const mobileSpread = short
      ? 0.1
      : hours === 2
        ? 0.2
        : hours === 3
          ? 0.2
          : hours <= 5
            ? 0.25
            : 0.3;
    const mobileSize = `min(${(clipped ? mobileFactor + u * mobileSpread : Math.min(1, mobileFactor + u * mobileSpread)) * 100}cqw, ${short ? 65 : hours === 2 ? 52 : hours === 3 ? 65 : 78}cqh)`;
    inner.style.setProperty("--mobile-stamp-size", mobileSize);
    const mh = "calc(var(--stamp-size) / 2)";
    const mi = `calc(var(--stamp-size) * ${corner ? 0.36 : 0.27})`;
    const mx = `clamp(${mh}, ${x * 100}%, calc(100% - ${mh}))`;
    const my = `clamp(calc(19px + ${mh}), ${y * 100}%, calc(100% - ${mh}))`;
    inner.style.setProperty(
      "--mobile-stamp-x",
      short
        ? "84%"
        : clipped && edge.includes("left")
          ? mi
          : clipped && edge.includes("right")
            ? `calc(100% - ${mi})`
            : mx,
    );
    inner.style.setProperty(
      "--mobile-stamp-y",
      short
        ? "50%"
        : clipped && (corner || edge.includes("bottom"))
          ? `calc(100% - ${mi})`
          : my,
    );
    if (short) {
      const t = inner.querySelector(".booking-time");
      t.dataset.compact =
        b.start.slice(11, 13) +
        "–" +
        String(Number(b.start.slice(11, 13)) + 1).padStart(2, "0");
      t.title = t.textContent;
    }
    // At a corner each circular cap removes at most 12.5% of the disk.
    const inset = `calc(var(--stamp-size) * ${corner ? 0.33 + rnd() * 0.055 : 0.22 + rnd() * 0.07})`;
    const half = "calc(var(--stamp-size) / 2)";
    const safeX = `clamp(${half}, ${x * 100}%, calc(100% - ${half}))`;
    const safeY = `clamp(${half}, ${y * 100}%, calc(100% - ${half}))`;
    inner.style.setProperty(
      "--stamp-x",
      clipped
        ? edge.includes("left")
          ? inset
          : edge.includes("right")
            ? `calc(100% - ${inset})`
            : safeX
        : `${x * 100}%`,
    );
    inner.style.setProperty(
      "--stamp-y",
      clipped
        ? edge.includes("bottom")
          ? `calc(100% - ${inset})`
          : edge.includes("top")
            ? inset
            : safeY
        : `${y * 100}%`,
    );
    // Only visibility may change when text cannot fit; never choose a new position.
    return function measureStamp() {
      const r = stamp.getBoundingClientRect();
      const cx = (r.left + r.right) / 2,
        cy = (r.top + r.bottom) / 2;
      const radius = stamp.offsetWidth / 2;
      const collision = [
        ...inner.querySelectorAll(".booking-name,.booking-time"),
      ].some((el) => {
        const t = el.getBoundingClientRect();
        return (
          Math.hypot(
            cx - Math.max(t.left, Math.min(cx, t.right)),
            cy - Math.max(t.top, Math.min(cy, t.bottom)),
          ) <
          radius + 1
        );
      });
      return { stamp, visibility: collision ? "hidden" : "visible" };
    };
  }

  function getSessionKeys(start, b) {
    let [day, time] = start.split("T"),
      h = Number(time.slice(0, 2)),
      out = [];
    for (let i = 0; i < b.duration; i++) out.push(key(day, h + i));
    return out;
  }
  function isFree(start, duration, ignoreStart = null) {
    let [day, time] = start.split("T"),
      h = Number(time.slice(0, 2));
    if (h + duration > 24) return false;
    for (let i = 0; i < duration; i++) {
      let k = key(day, h + i);
      if (bookings[k] && bookings[k].start !== ignoreStart) return false;
    }
    return true;
  }
  const palette = [
    "#dc5263",
    "#e68a38",
    "#c9a019",
    "#8ca52f",
    "#329b62",
    "#169d96",
    "#2799bd",
    "#5278d5",
    "#9260c7",
    "#d34d9b",
    "#a87545",
    "#777e89",
  ];
  let selectedColor = palette[0],
    groupColors = Object.create(null);
  const vividColors = {
    "#f4c9c9": "#dc5263",
    "#f5d5b5": "#e68a38",
    "#f5e7ae": "#c9a019",
    "#dce9b6": "#8ca52f",
    "#bce2c6": "#329b62",
    "#b8e4df": "#169d96",
    "#b9dcec": "#2799bd",
    "#c6d2f4": "#5278d5",
    "#d9c9ef": "#9260c7",
    "#efc9e2": "#d34d9b",
    "#e2d4c5": "#a87545",
    "#d5d5d5": "#777e89",
  };
  function vividColor(c) {
    return vividColors[String(c).toLowerCase()] || c;
  }
  function groupColor(n) {
    return (
      groupColors[n] ||
      palette[
        Array.from(n).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % 12
      ]
    );
  }
  function paintPalette() {
    $("palette").replaceChildren();
    for (const c of palette) {
      let b = document.createElement("button");
      b.type = "button";
      b.style.cssText = `width:42px;height:42px;border-radius:50%;background:${c};border:${c === selectedColor ? "2px solid #222" : "1px solid #ccc"}`;
      b.setAttribute("aria-label", c);
      b.onclick = () => {
        selectedColor = c;
        paintPalette();
      };
      $("palette").append(b);
    }
  }
  function refreshGroups() {
    const q = $("groupName").value.trim().toLocaleLowerCase("ru"),
      box = $("groupOptions");
    box.replaceChildren();
    const names = [
      ...new Set([
        ...Object.values(bookings).map((b) => b.group),
        ...Object.keys(rates),
        ...Object.keys(groupColors),
        ...groupRows.map((g) => g.name),
      ]),
    ]
      .filter((n) => q && n.toLocaleLowerCase("ru").includes(q))
      .sort();
    box.hidden = !names.length;
    for (const n of names) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = n;
      b.style.cssText =
        "display:block;width:100%;text-align:left;padding:12px;background:white;border:0;cursor:pointer";
      b.onclick = () => {
        $("groupName").value = n;
        selectedColor = groupColor(n);
        paintPalette();
        box.hidden = true;
      };
      box.append(b);
    }
  }
  $("groupName").oninput = () => {
    selectedColor = groupColor($("groupName").value.trim());
    paintPalette();
    refreshGroups();
  };

  function openModal(k, b, owner = admin) {
    if (!ready || busy) return;
    activeKey = b ? b.start : k;
    let [day, time] = activeKey.split("T"),
      d = new Date(day + "T12:00:00Z"),
      label =
        d.toLocaleDateString("ru-RU", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }) +
        " · " +
        time;
    if (b && owner && admin) {
      $("ownerGroup").textContent = b.group;
      $("ownerDate").textContent = label;
      $("ownerDuration").innerHTML = $("duration").innerHTML;
      $("ownerDuration").value = b.duration;
      $("ownerPrice").value =
        b.price ?? suggestPrice(b.group, b.duration) ?? "";
      $("ownerModal").classList.add("show");
      return;
    }
    editingOwn = !!b;
    $("groupName").readOnly = editingOwn;
    $("palette").style.pointerEvents = editingOwn ? "none" : "";
    $("bookingForm").querySelector("[type=submit]").textContent = editingOwn
      ? "Сохранить"
      : "Забронировать";
    $("modalTitle").textContent = "Бронирование сессии";
    $("modalDate").textContent = label;
    $("groupName").value = "";
    refreshGroups();
    selectedColor = palette[0];
    paintPalette();
    $("duration").value = 1;
    $("duration").disabled = false;
    $("deleteBtn").style.display = "none";
    if (editingOwn) {
      $("modalTitle").textContent = "Изменить бронирование";
      $("groupName").value = b.group;
      selectedColor = groupColor(b.group);
      paintPalette();
      $("duration").value = b.duration;
      $("deleteBtn").style.display = "inline-block";
      $("deleteBtn").textContent = "Отменить запись";
    }
    $("modalBack").classList.add("show");
  }
  function closeModal() {
    $("modalBack").classList.remove("show");
    $("ownerModal").classList.remove("show");
  }
  function payOwner() {
    if (!admin || !bookings[activeKey]) return;
    const field = $("ownerPrice"),
      price = Number(field.value);
    if (!field.value.trim() || !Number.isFinite(price) || price < 0) {
      alert("Введите корректную сумму");
      return;
    }
    updateOwnerBooking(Number($("ownerDuration").value), price, "paid");
  }
  $("ownerPay").onclick = payOwner;
  $("ownerForm").onsubmit = (e) => {
    e.preventDefault();
    payOwner();
  };
  $("ownerCancel").onclick = closeModal;
  $("ownerModal").onclick = (e) => {
    if (e.target === $("ownerModal")) closeModal();
  };
  $("ownerDelete").onclick = () => $("deleteBtn").onclick();
  $("ownerDuration").onchange = () => {
    let b = bookings[activeKey];
    if (b && b.payment !== "paid")
      $("ownerPrice").value =
        suggestPrice(b.group, Number($("ownerDuration").value)) ?? "";
  };
  $("cancelBtn").onclick = closeModal;
  $("modalBack").onclick = (e) => {
    if (e.target === $("modalBack")) closeModal();
  };
  $("prev").onclick = () => {
    moveMonth(-1);
  };
  $("next").onclick = () => {
    moveMonth(1);
  };
  $("ownerTodayBtn").onclick = $("todayBtn").onclick = () => {
    view = moscowDate();
    renderCalendar();
  };
  document.querySelectorAll("[data-tab]").forEach(
    (btn) =>
      (btn.onclick = () => {
        document
          .querySelectorAll("[data-tab]")
          .forEach((x) => x.classList.toggle("active", x === btn));
        document
          .querySelectorAll(".page")
          .forEach((x) =>
            x.classList.toggle("active", x.id === btn.dataset.tab),
          );
        if (btn.dataset.tab === "admin" && !admin) {
          $("loginBox").style.display = "block";
          $("adminContent").style.display = "none";
        }
      }),
  );
  $("logout").onclick = () => {
    admin = false;
    $("pin").value = "";
    $("loginBox").style.display = "block";
    $("adminContent").style.display = "none";
    $("logout").style.display = "none";
    document
      .querySelectorAll("[data-tab]")
      .forEach((x) =>
        x.classList.toggle("active", x.dataset.tab === "booking"),
      );
    document
      .querySelectorAll(".page")
      .forEach((x) => x.classList.toggle("active", x.id === "booking"));
    renderCalendar();
  };
  $("aprev").onclick = () => {
    analyticsDate.setUTCMonth(analyticsDate.getUTCMonth() - 1);
    renderAdmin();
  };
  $("anext").onclick = () => {
    analyticsDate.setUTCMonth(analyticsDate.getUTCMonth() + 1);
    renderAdmin();
  };
  function monthEntries(d) {
    let prefix = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-`;
    let unique = {};
    Object.values(bookings)
      .filter((b) => b.start.startsWith(prefix))
      .forEach((b) => (unique[b.start] = b));
    return Object.values(unique);
  }
  // Cancelled sessions belong in the owner journal, outside active totals.
  let bookingHistory = [];
  function recordEntries() {
    const month = dateKey(analyticsDate).slice(0, 7);
    const cancelled = bookingHistory.flatMap(
      ({ before_state: snapshot, group_name }) => {
        if (!snapshot?.starts_at) return [];
        const date = moscowDate(snapshot.starts_at);
        const start = key(dateKey(date), date.getUTCHours());
        if (!start.startsWith(month)) return [];
        return [
          {
            start,
            group: group_name || "—",
            duration: Number(snapshot.duration_hours) || 0,
            cancelled: true,
          },
        ];
      },
    );
    return [...monthEntries(analyticsDate), ...cancelled].sort((a, b) =>
      b.start.localeCompare(a.start),
    );
  }

  let standard = null;
  function suggestPrice(group, duration) {
    return duration === 3
      ? Object.hasOwn(rates, group)
        ? rates[group]
        : standard
      : null;
  }
  $("standard").value = standard ?? "";
  $("ownerPrev").onclick = $("prev").onclick;
  $("ownerNext").onclick = $("next").onclick;

  /* Interactive week swipe with coordinated ant and calendar motion. */
  let antWeekRunning = false;
  function runAnt(button) {
    button.classList.add("ant-running");
    setTimeout(() => button.classList.remove("ant-running"), 680);
  }
  for (const id of ["prev", "next", "ownerPrev", "ownerNext"]) {
    const button = $(id),
      original = button.onclick;
    button.onclick = function (event) {
      if (antWeekRunning) return;
      antWeekRunning = true;
      runAnt(button);
      setTimeout(
        () => {
          antWeekRunning = false;
          original.call(button, event);
        },
        matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 680,
      );
    };
  }
  for (const [calendarId, prevId, nextId] of [
    ["calendar", "prev", "next"],
    ["ownerCalendar", "ownerPrev", "ownerNext"],
  ]) {
    const grid = $(calendarId),
      surface = grid.closest(".calendar-wrap");
    surface.style.touchAction = "pan-y pinch-zoom";
    let start = null,
      suppressUntil = 0;
    const reduced = () =>
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reset = () => {
      grid.style.transition = "transform 180ms ease-out";
      grid.style.transform = "";
      start = null;
    };
    surface.addEventListener(
      "touchstart",
      (e) => {
        if (antWeekRunning || e.touches.length !== 1) return;
        start = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          axis: null,
        };
        grid.style.transition = "none";
      },
      { passive: true },
    );
    surface.addEventListener(
      "touchmove",
      (e) => {
        if (!start) return;
        if (e.touches.length !== 1) {
          reset();
          return;
        }
        const dx = e.touches[0].clientX - start.x,
          dy = e.touches[0].clientY - start.y;
        if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10)
          start.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "y";
        if (start.axis === "x") {
          if (e.cancelable) e.preventDefault();
          if (!reduced())
            grid.style.transform =
              "translateX(" +
              Math.max(
                -surface.clientWidth,
                Math.min(surface.clientWidth, dx),
              ) +
              "px)";
        }
      },
      { passive: false },
    );
    surface.addEventListener("touchcancel", reset, { passive: true });
    surface.addEventListener(
      "touchend",
      (e) => {
        if (!start) return;
        if (e.touches.length || !e.changedTouches.length) {
          reset();
          return;
        }
        const t = e.changedTouches[0],
          dx = t.clientX - start.x,
          dy = t.clientY - start.y;
        start = null;
        if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5) {
          reset();
          return;
        }
        if (e.cancelable) e.preventDefault();
        suppressUntil = Date.now() + 750;
        const delta = dx < 0 ? 1 : -1;
        antWeekRunning = true;
        runAnt($(delta > 0 ? nextId : prevId));
        if (reduced()) {
          moveMonth(delta);
          grid.style.transform = "";
          antWeekRunning = false;
          return;
        }
        grid.style.transition = "transform 220ms ease-in";
        grid.style.transform =
          "translateX(" + -delta * surface.clientWidth + "px)";
        setTimeout(() => {
          grid.style.transition = "none";
          moveMonth(delta);
          grid.style.transform =
            "translateX(" + delta * surface.clientWidth + "px)";
          grid.getBoundingClientRect();
          grid.style.transition = "transform 280ms ease-out";
          grid.style.transform = "";
          setTimeout(() => {
            grid.style.transition = "";
            antWeekRunning = false;
          }, 460);
        }, 220);
      },
      { passive: false },
    );
    surface.addEventListener(
      "click",
      (e) => {
        if (Date.now() < suppressUntil) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
  }

  function effective(b) {
    return b.price ?? suggestPrice(b.group, b.duration);
  }
  function renderAdmin() {
    if (!admin) return;
    let n = debts().length;
    $("unpaidBtn").textContent = "Неоплаченная — " + n;
    $("unpaidBtn").disabled = !n;
    $("amonth").textContent = monthLabel(analyticsDate);
    let arr = monthEntries(analyticsDate).sort((a, b) =>
        a.start.localeCompare(b.start),
      ),
      hours = arr.reduce((a, b) => a + b.duration, 0),
      groups = new Map();
    $("hours").textContent = hours;
    $("free").textContent =
      new Date(
        Date.UTC(
          analyticsDate.getUTCFullYear(),
          analyticsDate.getUTCMonth() + 1,
          0,
        ),
      ).getUTCDate() *
        15 -
      hours;
    $("income").textContent = money(
      arr
        .filter((b) => b.payment === "paid" && b.price !== null)
        .reduce((a, b) => a + b.price, 0),
    );
    $("pendingSum").textContent = money(
      arr
        .filter((b) => b.payment !== "paid" && effective(b) !== null)
        .reduce((a, b) => a + effective(b), 0),
    );
    for (const b of Object.values(bookings)) {
      if (!groups.has(b.group)) groups.set(b.group, []);
    }
    for (const b of arr) {
      if (!groups.has(b.group)) groups.set(b.group, []);
      groups.get(b.group).push(b);
    }
    $("people").replaceChildren();
    for (const [name, items] of groups) {
      let tr = document.createElement("tr");
      let known = items.filter((b) => effective(b) !== null);
      tr.innerHTML = `<td>${esc(name)}</td><td>${items.length}</td><td>${items.reduce((a, b) => a + b.duration, 0)}</td><td>${known.length ? money(known.reduce((a, b) => a + effective(b), 0)) : "—"}${known.length < items.length ? " (не все цены)" : ""}</td><td></td>`;
      let input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = ".01";
      input.placeholder = "Стандарт";
      input.value = Object.hasOwn(rates, name) ? rates[name] : "";
      input.onchange = () => saveRate("group:" + name, input);
      tr.lastElementChild.append(input);
      $("people").append(tr);
    }
    renderRecords();
  }

  function renderRecords() {
    const records = document.createDocumentFragment();
    const entries = recordEntries();
    for (const booking of entries) {
      const row = document.createElement("tr");
      const price = booking.cancelled ? null : effective(booking);
      if (booking.cancelled) row.style.opacity = ".55";
      for (const value of [
        booking.start.replace("T", " "),
        booking.group,
        `${booking.duration} ч`,
        price === null ? "—" : money(price),
        booking.cancelled
          ? "Отменено"
          : booking.payment === "paid"
            ? "Оплачено"
            : "Не оплачено",
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      const action = document.createElement("td");
      if (!booking.cancelled) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn";
        button.textContent = "Изменить";
        button.onclick = () => openModal(booking.start, booking, true);
        action.append(button);
      }
      row.append(action);
      records.append(row);
    }
    $("recordsBody").replaceChildren(records);
    $("noRecords").style.display = entries.length ? "none" : "block";
  }
  $("exportBtn").onclick = () => {
    let rows = [
      [
        "Дата",
        "Время",
        "Группа",
        "Длительность часов",
        "Цена за сессию RUB",
        "Оплата",
      ],
      ...recordEntries().map((b) => [
        b.start.slice(0, 10),
        b.start.slice(11),
        b.group,
        b.duration,
        b.cancelled ? "" : effective(b),
        b.cancelled
          ? "Отменено"
          : b.payment === "paid"
            ? "Оплачено"
            : "Не оплачено",
      ]),
    ];
    let csv =
        "\ufeff" +
        rows
          .map((r) =>
            r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(";"),
          )
          .join("\n"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = "studio-finances.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  let db;
  function connectDatabase() {
    return window.supabase?.createClient(
      "https://aqtupxpsqztihffplwpq.supabase.co",
      "sb_publishable_2GINigUvOCNs3DKCjGG8nA_lNikO5v6",
    );
  }
  const ownerId = "a2c84466-db37-45ee-80d5-65c90544086e";
  let ready = false,
    busy = false,
    groupRows = [],
    editingOwn = false;
  const tokenKey = (id) => "formicarium-own-" + id;
  function own(b) {
    if (!b || moscowInstant(b.start).getTime() <= Date.now()) return null;
    try {
      const t = JSON.parse(localStorage.getItem(tokenKey(b.id)));
      return t && Date.now() < t.until ? t.token : null;
    } catch {
      return null;
    }
  }
  function newToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
  }

  function checked(r) {
    if (r.error) throw r.error;
    return r.data;
  }
  function status(t) {
    $("syncStatus").textContent = t;
  }
  function failure(e) {
    status("Ошибка подключения или сохранения: " + e.message);
    alert(e.message);
  }
  let loadSequence = 0;

  async function refreshBookingHistory(sequence) {
    try {
      const result = await db
        .from("booking_events")
        .select("booking_id,group_name,before_state,occurred_at")
        .eq("action", "DELETE")
        .order("occurred_at", { ascending: false })
        .limit(10000)
        .abortSignal(AbortSignal.timeout(15000));
      if (!admin || sequence !== loadSequence) return;
      bookingHistory = checked(result) ?? [];
      renderRecords();
    } catch {
      if (admin && sequence === loadSequence) {
        status("Расписание синхронизировано; история отмен недоступна");
      }
    }
  }

  async function reload() {
    const sequence = ++loadSequence;
    const owner = admin;
    const signal = AbortSignal.timeout(15000);
    const [groupsResult, bookingsResult, ratesResult] = await Promise.all([
      db
        .from("groups")
        .select("id,name,color,created_at")
        .limit(10000)
        .abortSignal(signal),
      db
        .from("bookings")
        .select(
          owner
            ? "id,group_id,starts_at,duration_hours,price_total,payment_status"
            : "id,group_id,starts_at,duration_hours",
        )
        .limit(10000)
        .abortSignal(signal),
      owner
        ? db.from("studio_rates").select("rate_key,price").abortSignal(signal)
        : null,
    ]);
    if (sequence !== loadSequence || owner !== admin) return;
    const gs = checked(groupsResult),
      bs = checked(bookingsResult);
    const groupsById = new Map(gs.map((group) => [group.id, group]));
    if (admin) {
      const rr = checked(ratesResult);
      standard = null;
      rates = Object.create(null);
      for (const r of rr) {
        if (r.rate_key === "standard") standard = Number(r.price);
        else if (r.rate_key.startsWith("group:"))
          rates[r.rate_key.slice(6)] = Number(r.price);
      }
      $("standard").value = standard ?? "";
    }
    groupRows = gs;
    groupColors = Object.create(null);
    for (const g of gs)
      if (/^#[0-9a-f]{6}$/i.test(g.color || ""))
        groupColors[g.name] = vividColor(g.color);
    bookings = {};
    for (const r of bs) {
      const d = moscowDate(r.starts_at),
        start = key(dateKey(d), d.getUTCHours()),
        g = groupsById.get(r.group_id);
      if (!g) continue;
      const b = {
        id: r.id,
        start,
        group: g.name,
        duration: r.duration_hours,
        price: admin ? r.price_total : null,
        payment: admin ? r.payment_status : "pending",
      };
      for (const k of getSessionKeys(start, b)) bookings[k] = b;
    }
    ready = true;
    status("Расписание синхронизировано");
    renderCalendar();
    renderAdmin();
    if (owner) void refreshBookingHistory(sequence);
  }
  async function mutate(fn) {
    if (!ready || busy) return;
    busy = true;
    try {
      await fn();
      closeModal();
      await reload();
    } catch (e) {
      failure(e);
      try {
        await reload();
      } catch {
        ready = false;
      }
    } finally {
      busy = false;
    }
  }
  $("bookingForm").onsubmit = (e) => {
    e.preventDefault();
    const name = $("groupName").value.trim(),
      duration = Number($("duration").value),
      start = activeKey,
      b = bookings[start];
    if (!admin && moscowInstant(start).getTime() <= Date.now())
      return alert("Это время уже прошло");
    if (!name || !isFree(start, duration, editingOwn ? b?.start : null))
      return alert("Интервал занят");
    mutate(async () => {
      if (editingOwn) {
        const token = own(b);
        if (
          !token ||
          !checked(
            await db.rpc("edit_own_booking", {
              p_booking_id: b.id,
              p_token: token,
              p_starts_at: moscowInstant(start).toISOString(),
              p_duration_hours: duration,
            }),
          )
        )
          throw Error("Срок изменения истёк или запись недоступна");
        return;
      }
      let g = groupRows.find((x) => x.name === name);
      if (!g)
        g = checked(
          await db
            .from("groups")
            .insert({ name, color: selectedColor })
            .select("id,name,color")
            .single(),
        );
      if (admin) {
        checked(
          await db.from("bookings").insert({
            group_id: g.id,
            starts_at: moscowInstant(start).toISOString(),
            duration_hours: duration,
          }),
        );
        return;
      }
      const token = newToken(),
        until = Date.now() + 10800000;
      localStorage.setItem("formicarium-storage-test", token);
      localStorage.removeItem("formicarium-storage-test");
      const id = checked(
        await db.rpc("create_own_booking", {
          p_group_id: g.id,
          p_starts_at: moscowInstant(start).toISOString(),
          p_duration_hours: duration,
          p_token: token,
        }),
      );
      localStorage.setItem(tokenKey(id), JSON.stringify({ token, until }));
    });
  };
  function updateOwnerBooking(duration, price, payment) {
    const b = bookings[activeKey];
    if (!admin || !b || !isFree(activeKey, duration, b.start))
      return alert("Интервал занят");
    mutate(async () => {
      checked(
        await db
          .from("bookings")
          .update({
            duration_hours: duration,
            price_total: price,
            payment_status: payment,
          })
          .eq("id", b.id),
      );
    });
  }
  $("deleteBtn").onclick = () => {
    const b = bookings[activeKey];
    if (!b || !confirm("Отменить всю сессию?")) return;
    mutate(async () => {
      if (admin) {
        checked(await db.from("bookings").delete().eq("id", b.id));
        return;
      }
      const token = own(b);
      if (
        !token ||
        !checked(
          await db.rpc("cancel_own_booking", {
            p_booking_id: b.id,
            p_token: token,
          }),
        )
      )
        throw Error("Срок отмены истёк или запись недоступна");
      localStorage.removeItem(tokenKey(b.id));
    });
  };
  for (const id of ["email", "pin"])
    $(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing && !e.repeat) {
        e.preventDefault();
        $("login").click();
      }
    });
  $("login").onclick = async () => {
    try {
      const a = checked(
        await db.auth.signInWithPassword({
          email: $("email").value.trim(),
          password: $("pin").value,
        }),
      );
      if (a.user.id !== ownerId) {
        await db.auth.signOut();
        throw Error("Нет прав владельца");
      }
      admin = true;
      ready = false;
      await reload();
      $("loginBox").style.display = "none";
      $("adminContent").style.display = "block";
      $("logout").style.display = "inline-block";
      $("pin").value = "";
    } catch (e) {
      admin = false;
      bookings = {};
      ready = false;
      await db.auth.signOut();
      failure(e);
      try {
        await reload();
      } catch {}
    }
  };
  const oldLogout = $("logout").onclick;
  $("logout").onclick = async () => {
    ++loadSequence;
    bookingHistory = [];
    ready = false;
    bookings = {};
    standard = null;
    rates = Object.create(null);
    $("standard").value = "";
    oldLogout();
    $("recordsBody").replaceChildren();
    $("people").replaceChildren();
    try {
      checked(await db.auth.signOut());
      await reload();
    } catch (e) {
      failure(e);
    }
  };
  async function saveRate(key, input) {
    if (!admin || busy || !input.reportValidity()) return;
    const value = input.value;
    busy = true;
    try {
      if (value === "")
        checked(await db.from("studio_rates").delete().eq("rate_key", key));
      else
        checked(
          await db
            .from("studio_rates")
            .upsert({ rate_key: key, price: Number(value) }),
        );
      await reload();
    } catch (e) {
      failure(e);
    } finally {
      busy = false;
    }
  }
  $("saveStandard").onclick = () => saveRate("standard", $("standard"));
  renderCalendar();
  // Wait for the deferred client before synchronizing with Supabase.
  document.addEventListener(
    "DOMContentLoaded",
    async () => {
      try {
        db = connectDatabase();
        if (!db) throw Error("Не удалось загрузить Supabase");
        const session = checked(await db.auth.getSession()).session;
        if (session) {
          const user = checked(await db.auth.getUser()).user;
          if (user?.id === ownerId) {
            admin = true;
            $("loginBox").style.display = "none";
            $("adminContent").style.display = "block";
            $("logout").style.display = "inline-block";
          } else {
            checked(await db.auth.signOut());
          }
        }
        await reload().catch(() => {
          status("База не ответила. Повторим подключение автоматически.");
        });
        let refreshing = false;
        setInterval(async () => {
          if (
            !busy &&
            !refreshing &&
            !(admin && document.activeElement?.matches("input")) &&
            !$("modalBack").classList.contains("show") &&
            !$("ownerModal").classList.contains("show")
          ) {
            refreshing = true;
            try {
              await reload();
            } catch {
              status("База не ответила. Повторим подключение автоматически.");
            } finally {
              refreshing = false;
            }
          }
        }, 15000);
      } catch (e) {
        failure(e);
      }
    },
    { once: true },
  );
})();
