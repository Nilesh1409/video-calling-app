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

const users = {};

io.on("connection", (socket) => {
  socket.emit("me", socket.id);
  socket.emit("onlineUsers", users);

  socket.on("registerUser", (userId) => {
    users[userId] = socket.id;

    console.log(`User ${userId} mapped to socket ${socket.id}`);
  });

  console.log(`New client connected with socket ID: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log("User disconnected");
    // Remove the user from the mapping when they disconnect
    Object.keys(users).forEach((userId) => {
      if (users[userId] === socket.id) {
        delete users[userId];
        console.log(`User ${userId} disconnected and removed from mapping`);
      }
    });
    socket.broadcast.emit("callEnded");
  });

  socket.on("callUser", (data) => {
    console.log(
      "🚀 ~ socket.on ~ data:",
      data,
      users[data.from],
      users[data.userToCall]
    );
    console.log("🚀 ~ socket.on ~ users[data.from],:", users[data.from]);
    console.log(
      "🚀 ~ socket.on ~ users[data.userToCall]:",
      users[data.userToCall]
    );
    io.to(users[data.userToCall]).emit("callUser", {
      signal: data.signalData,
      from: users[data.from],
      name: data.name,
    });
  });

  socket.on("answerCall", (data) => {
    console.log("🚀 ~ socket.on ~ answerCall", data);
    io.to(data.to).emit("callAccepted", data.signal);
  });
});

server.listen(8080, () => console.log("server is running on port 8080"));
