const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.emit("me", socket.id);

  console.log(`New client connected with socket ID: ${socket.id}`);

  socket.on("disconnect", () => {
    socket.broadcast.emit("callEnded");
    console.log("User disconnected");
  });

  socket.on("callUser", (data) => {
    // console.log("🚀 ~ socket.on ~ data:", data);
    io.to(data.userToCall).emit("callUser", {
      signal: data.signalData,
      from: data.from,
      name: data.name,
    });
  });

  socket.on("answerCall", (data) => {
    // console.log("🚀 ~ socket.on ~ answerCall", data);
    io.to(data.to).emit("callAccepted", data.signal);
  });
});

server.listen(8080, () => console.log("server is running on port 8080"));
