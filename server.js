import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 開発用に全て許可
  }
});

// 静的ファイルの提供 (本番環境用)
app.use(express.static(path.join(__dirname, 'dist')));

// プレイヤーの状態を保持するオブジェクト
const players = {};
// ブロックの状態を保持する配列 ({x, y, z, color})
let blocks = [];

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // 新しいプレイヤーを登録
  players[socket.id] = {
    position: [0, 1, 0],
    rotation: [0, 0, 0]
  };

  // 接続したプレイヤーに現在のワールドの状態（ブロックと他のプレイヤー）を送信
  socket.emit('init', { players, blocks });

  // 他の全プレイヤーに新しいプレイヤーが参加したことを通知
  socket.broadcast.emit('playerJoin', { id: socket.id, player: players[socket.id] });

  // プレイヤーの移動と視点移動を受信
  socket.on('updatePlayer', (data) => {
    if (players[socket.id]) {
      players[socket.id] = data;
      // 他のプレイヤーに位置情報をブロードキャスト
      socket.broadcast.emit('playerMove', { id: socket.id, player: data });
    }
  });

  // ブロックの追加を受信
  socket.on('addBlock', (block) => {
    blocks.push(block);
    // 全員（送信者含む）にブロック追加を通知
    io.emit('blockAdded', block);
  });

  // ブロックの削除を受信
  socket.on('removeBlock', (position) => {
    blocks = blocks.filter(b => b.x !== position.x || b.y !== position.y || b.z !== position.z);
    io.emit('blockRemoved', position);
  });

  // 切断時の処理
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeave', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
