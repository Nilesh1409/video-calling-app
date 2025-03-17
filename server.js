const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const { v4: uuidv4 } = require("uuid");
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Store users and rooms
const users = {};
const rooms = {};
console.log("🚀 ~ users:", users);

io.on("connection", (socket) => {
  socket.emit("me", socket.id);
  io.emit("onlineUsers", users);
  io.emit(
    "availableRooms",
    Object.keys(rooms).map((roomId) => ({
      id: roomId,
      name: rooms[roomId].name,
      participants: Object.keys(rooms[roomId].participants).length,
    }))
  );

  // Register user
  socket.on("registerUser", (userId) => {
    users[userId] = socket.id;
    io.emit("onlineUsers", users);
    console.log(`User ${userId} mapped to socket ${socket.id}`);
  });

  // Create a new room
  socket.on("createRoom", ({ userId, roomName }) => {
    const roomId = uuidv4().substring(0, 6); // Generate a short room ID
    rooms[roomId] = {
      name: roomName || `${userId}'s Room`,
      creator: userId,
      participants: {},
    };

    // Send the room ID back to the creator
    socket.emit("roomCreated", { roomId, roomName: rooms[roomId].name });

    // Broadcast updated room list
    io.emit(
      "availableRooms",
      Object.keys(rooms).map((id) => ({
        id,
        name: rooms[id].name,
        participants: Object.keys(rooms[id].participants).length,
      }))
    );

    console.log(`Room ${roomId} created by ${userId}`);
  });

  // Join a room
  socket.on("joinRoom", ({ userId, roomId }) => {
    if (!rooms[roomId]) {
      socket.emit("roomError", { message: "Room does not exist" });
      return;
    }

    // Add user to room
    rooms[roomId].participants[userId] = socket.id;

    // Join the socket room
    socket.join(roomId);

    // Notify everyone in the room about the new participant
    io.to(roomId).emit("userJoinedRoom", {
      roomId,
      userId,
      participants: Object.keys(rooms[roomId].participants),
    });

    // Send the current participants to the joining user
    socket.emit("roomParticipants", {
      roomId,
      participants: Object.keys(rooms[roomId].participants),
    });

    // Broadcast updated room list
    io.emit(
      "availableRooms",
      Object.keys(rooms).map((id) => ({
        id,
        name: rooms[id].name,
        participants: Object.keys(rooms[id].participants).length,
      }))
    );

    console.log(`User ${userId} joined room ${roomId}`);
  });

  // Leave a room
  socket.on("leaveRoom", ({ userId, roomId }) => {
    if (rooms[roomId] && rooms[roomId].participants[userId]) {
      // Remove user from room
      delete rooms[roomId].participants[userId];

      // Leave the socket room
      socket.leave(roomId);

      // Notify everyone in the room
      io.to(roomId).emit("userLeftRoom", {
        roomId,
        userId,
        participants: Object.keys(rooms[roomId].participants),
      });

      // If room is empty, delete it
      if (Object.keys(rooms[roomId].participants).length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted (empty)`);
      }

      // Broadcast updated room list
      io.emit(
        "availableRooms",
        Object.keys(rooms).map((id) => ({
          id,
          name: rooms[id].name,
          participants: Object.keys(rooms[id].participants).length,
        }))
      );

      console.log(`User ${userId} left room ${roomId}`);
    }
  });

  // Signal for group calls
  socket.on("sendSignal", ({ signal, userId, roomId, to }) => {
    if (rooms[roomId] && rooms[roomId].participants[to]) {
      const toSocketId = rooms[roomId].participants[to];
      io.to(toSocketId).emit("receiveSignal", {
        signal,
        from: userId,
      });
      console.log(`Signal sent from ${userId} to ${to} in room ${roomId}`);
    }
  });

  // Handle direct calls (1-on-1)
  socket.on("callUser", (data) => {
    console.log(`Call from ${data.from} to ${data.userToCall}`);
    io.to(users[data.userToCall]).emit("callUser", {
      signal: data.signalData,
      from: users[data.from],
      name: data.name,
    });
  });

  socket.on("answerCall", (data) => {
    console.log(`Call answered by ${data.to}`);
    io.to(data.to).emit("callAccepted", data.signal);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`Socket ${socket.id} disconnected`);

    // Find and remove user from users mapping
    let disconnectedUserId = null;
    Object.keys(users).forEach((userId) => {
      if (users[userId] === socket.id) {
        disconnectedUserId = userId;
        delete users[userId];
        console.log(`User ${userId} disconnected and removed from mapping`);
      }
    });

    // Remove user from all rooms they were in
    Object.keys(rooms).forEach((roomId) => {
      let userLeftRoom = false;

      Object.keys(rooms[roomId].participants).forEach((userId) => {
        if (rooms[roomId].participants[userId] === socket.id) {
          delete rooms[roomId].participants[userId];
          userLeftRoom = true;

          // Notify everyone in the room
          io.to(roomId).emit("userLeftRoom", {
            roomId,
            userId,
            participants: Object.keys(rooms[roomId].participants),
          });

          console.log(`User ${userId} removed from room ${roomId}`);
        }
      });

      // If user left a room and it's now empty, delete it
      if (
        userLeftRoom &&
        Object.keys(rooms[roomId].participants).length === 0
      ) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted (empty after disconnect)`);
      }
    });

    // Broadcast updated lists
    io.emit("onlineUsers", users);
    io.emit(
      "availableRooms",
      Object.keys(rooms).map((id) => ({
        id,
        name: rooms[id].name,
        participants: Object.keys(rooms[id].participants).length,
      }))
    );

    socket.broadcast.emit("callEnded");
  });

  // End call
  socket.on("endCall", (data) => {
    if (data.to) {
      io.to(data.to).emit("callEnded");
    }
  });
});

server.listen(8080, () => console.log("Server is running on port 8080"));
