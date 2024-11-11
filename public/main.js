/*global UIkit, Vue */

(() => {
  const notification = (config) =>
    UIkit.notification({
      pos: "top-right",
      timeout: 5000,
      ...config,
    });

  const alert = (message) =>
    notification({
      message,
      status: "danger",
    });

  const info = (message) =>
    notification({
      message,
      status: "success",
    });

  new Vue({
    el: "#app",
    data: {
      desc: "",
      activeTimers: [],
      oldTimers: [],
    },
    methods: {
      createTimer() {
        const description = this.desc;
        this.desc = "";
        fetch(`/api/timers`, {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${window.AUTH_TOKEN}`,
          },
          body: JSON.stringify({ userId: window.USER_ID, description }),
        })
        .then(response => {
        if (!response.ok) {
            alert(`Error creating timer: ${response.statusText}`);
            throw new Error("Failed to create timer");
        }
        return response.json();
        })
        .then(() => {
        info(`Created new timer "${description}"`);
        })
        .catch((err) => {
        alert(err.message); // Используем alert для обработки ошибок
        });
      },
      stopTimer(id) {
        fetch(`/api/timers/${id}/stop`, {
          method: "post",
          headers: {
            "Authorization": `Bearer ${window.AUTH_TOKEN}`,
          },
        }).then(() => {
          info(`Stopped the timer [${id}]`);
        });
      },
      formatTime(ts) {
        return new Date(ts).toTimeString().split(" ")[0];
      },
      formatDuration(d) {
        d = Math.floor(d / 1000);
        const s = d % 60;
        d = Math.floor(d / 60);
        const m = d % 60;
        const h = Math.floor(d / 60);
        return [h > 0 ? h : null, m, s]
          .filter((x) => x !== null)
          .map((x) => (x < 10 ? "0" : "") + x)
          .join(":");
      },
    },
    created() {
      const ws = new WebSocket("ws://localhost:3000"); // Подключение к WebSocket

      ws.onopen = () => {
        // Отправка сообщения об аутентификации
        ws.send(JSON.stringify({ action: "authenticate", sessionId: window.AUTH_TOKEN }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "all_timers") {
          this.oldTimers = data.payload.filter(timer => !timer.isActive);
          this.activeTimers = data.payload.filter(timer => timer.isActive);
        } else if (data.type === "active_timers") {
          data.payload.forEach(timer => {
            // Обновляем активные таймеры с актуальными данными
            const existingTimer = this.activeTimers.find(t => t.id === timer.id);
            if (existingTimer) {
              existingTimer.progress = timer.progress; // Обновляем прогресс
            } else {
              this.activeTimers.push(timer);
            }
          });
        }
      };
    },
  });
})();