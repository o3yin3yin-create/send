import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { doc, setDoc, updateDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { categories as allCategories, actionCards as allActionCards, emergencyCards as allEmergencyCards } from './localGameData';
import './App.css';

// Helper to shuffle
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Helper to draw
function drawCards(deck, count, originalDeck) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      deck.push(...shuffle(originalDeck));
    }
    drawn.push(deck.pop());
  }
  return drawn;
}

const playSound = (type) => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    if (type === 'flip') {
      // Premium organic whoosh/rustle (damped white noise with bandpass sweep)
      const bufferSize = audioCtx.sampleRate * 0.12; 
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(350, audioCtx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 0.12);
      filter.Q.setValueAtTime(4, audioCtx.currentTime);
      
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      
      noise.start();
      noise.stop(audioCtx.currentTime + 0.12);
    } else if (type === 'success') {
      // Premium warm glass chime / bell arpeggio (C5 -> E5 -> G5 -> C6 major chord)
      const freqs = [523.25, 659.25, 783.99, 1046.50];
      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq + (Math.random() * 2 - 1), audioCtx.currentTime);
        
        const startTime = audioCtx.currentTime + idx * 0.06;
        const duration = 0.55 - idx * 0.05;
        
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.06, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      });
    } else if (type === 'emergency') {
      // Smooth triangle descending slide (pleasant, warning tone)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(140, audioCtx.currentTime + 0.28);
      
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.28);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.28);
    } else if (type === 'gameover') {
      // Premium synthesizer brass/pad chord swell (C4, E4, G4, C5, E5)
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(250, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(2200, audioCtx.currentTime + 0.7);
        
        const startTime = audioCtx.currentTime + idx * 0.06;
        const duration = 1.1 - idx * 0.06;
        
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      });
    } else if (type === 'click') {
      // Soft organic woodclick (fast decayed pitch envelope)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.045);
      
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.045);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.045);
    }
  } catch (e) {
    console.warn("AudioContext error:", e);
  }
};

function ConfettiEffect() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const colors = ['#00f2fe', '#a855f7', '#10b981', '#ffd700', '#ff5e62'];
    const particles = Array.from({ length: 120 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 4,
      d: Math.random() * canvas.height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
      });
      update();
    }

    function update() {
      particles.forEach((p) => {
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
        p.tiltAngle += p.tiltAngleIncremental;
        p.tilt += Math.sin(p.tiltAngle - 0.5);
        
        if (p.y > canvas.height) {
          p.x = Math.random() * canvas.width;
          p.y = -20;
          p.tilt = Math.random() * 10 - 5;
        }
      });
    }

    function animLoop() {
      draw();
      animationId = requestAnimationFrame(animLoop);
    }

    animLoop();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999
      }}
    />
  );
}

export default function App() {
  const [mode, setMode] = useState('select'); // 'select' | 'local' | 'online'

  // Generate or retrieve persistent player ID
  const [myPlayerId] = useState(() => {
    let pid = localStorage.getItem('send_player_id');
    if (!pid) {
      pid = Math.random().toString(36).substr(2, 9);
      localStorage.setItem('send_player_id', pid);
    }
    return pid;
  });

  const [onlineRoomCode, setOnlineRoomCode] = useState(() => localStorage.getItem('send_room_code') || '');

  const handleRestoreSession = () => {
    playSound('click');
    const rCode = localStorage.getItem('send_room_code');
    const pName = localStorage.getItem('send_player_name');
    if (rCode && pName) {
      setOnlineRoomCode(rCode);
      setOnlineName(pName);
      setMode('online');
    }
  };

  const handleDiscardSession = () => {
    playSound('click');
    localStorage.removeItem('send_room_code');
    localStorage.removeItem('send_player_name');
    setOnlineRoomCode('');
  };
  
  // --- LOCAL MODE STATE ---
  const [localPlayers, setLocalPlayers] = useState(['لاعب 1', 'لاعب 2', 'لاعب 3']);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [localGameState, setLocalGameState] = useState(null);
  const [currentEnteringPlayerIdx, setCurrentEnteringPlayerIdx] = useState(0);
  const [localContactsInput, setLocalContactsInput] = useState(Array(10).fill(''));
  const [revealInputs, setRevealInputs] = useState(Array(10).fill(false));
  const [localActionDeck, setLocalActionDeck] = useState([]);
  const [localEmergencyDeck, setLocalEmergencyDeck] = useState([]);
  const [selectedNobodyVictimName, setSelectedNobodyVictimName] = useState('');

  // --- ONLINE MODE STATE ---
  const [onlineName, setOnlineName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomState, setRoomState] = useState(null);
  const [onlineContactsInput, setOnlineContactsInput] = useState(Array(10).fill(''));
  const [onlineRevealInputs, setOnlineRevealInputs] = useState(Array(10).fill(false));
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [onlineNobodyVictim, setOnlineNobodyVictim] = useState('');

  // --- UI TRANSITION STATE ---
  const [cardFlipped, setCardFlipped] = useState(false);
  const [showDevModal, setShowDevModal] = useState(false);
  const [showPhones, setShowPhones] = useState(false);

  // Computed players list to track online/disconnected status dynamically
  const playersList = React.useMemo(() => {
    if (!roomState || !roomState.players) return [];
    const now = Date.now();
    return roomState.players.map(p => ({
      ...p,
      isDisconnected: p.playerId !== myPlayerId && (now - (p.lastActive || 0) > 20000)
    }));
  }, [roomState, myPlayerId]);

  // Subscribe to room updates in Firestore
  useEffect(() => {
    if (mode === 'online' && onlineRoomCode) {
      const roomRef = doc(db, 'rooms', onlineRoomCode);
      
      const unsubscribe = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const updatedState = docSnap.data();
          
          setRoomState((prev) => {
            if (prev) {
              // 1. Detect game over
              if (updatedState.status === 'game_over' && prev.status !== 'game_over') {
                playSound('gameover');
              }
              // 2. Detect stage transitions
              if (updatedState.currentTurn && prev.currentTurn) {
                if (updatedState.currentTurn.stage === 'execute' && prev.currentTurn.stage !== 'execute') {
                  playSound('flip');
                }
                if (updatedState.currentTurn.emergencyCard && !prev.currentTurn.emergencyCard) {
                  playSound('emergency');
                }
              }
              // 3. Detect score increase
              const prevActive = prev.players[prev.turnIndex];
              const nextActive = updatedState.players.find(p => p.playerId === prevActive?.playerId);
              if (nextActive && prevActive && nextActive.score > prevActive.score) {
                playSound('success');
              }
            }
            return updatedState;
          });

          // Reset card flipped animation if moving to draw stage
          if (updatedState.currentTurn && updatedState.currentTurn.stage === 'draw') {
            setCardFlipped(false);
          }
        } else {
          // Room deleted or not found
          console.warn("Room not found in database.");
        }
      }, (error) => {
        console.error("Firestore snapshot error:", error);
      });

      return () => unsubscribe();
    }
  }, [mode, onlineRoomCode]);

  // Heartbeat to keep connection alive in Firestore
  useEffect(() => {
    if (mode !== 'online' || !onlineRoomCode || !roomState) return;
    
    const interval = setInterval(async () => {
      const roomRef = doc(db, 'rooms', onlineRoomCode);
      try {
        await runTransaction(db, async (transaction) => {
          const sfDoc = await transaction.get(roomRef);
          if (!sfDoc.exists()) return;
          
          const data = sfDoc.data();
          const players = data.players.map(p => {
            if (p.playerId === myPlayerId) {
              return { ...p, lastActive: Date.now() };
            }
            return p;
          });
          
          transaction.update(roomRef, { players });
        });
      } catch (e) {
        console.error("Heartbeat transaction failed: ", e);
      }
    }, 6000);
    
    return () => clearInterval(interval);
  }, [mode, onlineRoomCode, roomState]);

  // --- LOCAL GAME LOGIC ACTIONS ---
  
  const startLocalSetup = () => {
    playSound('click');
    if (localPlayers.length < 3) {
      alert('يجب أن يكون عدد اللاعبين 3 على الأقل للعب.');
      return;
    }
    const selectedCats = shuffle(allCategories).slice(0, 10);
    const actDeck = shuffle(allActionCards);
    const emgDeck = shuffle(allEmergencyCards);

    setLocalActionDeck(actDeck);
    setLocalEmergencyDeck(emgDeck);
    
    setLocalGameState({
      status: 'name_entry', // 'name_entry' | 'playing' | 'game_over'
      players: localPlayers.map(name => ({
        id: Math.random().toString(36).substr(2, 9),
        name,
        contacts: [],
        hand: [],
        score: 0
      })),
      selectedCategories: selectedCats,
      turnIndex: 0,
      currentTurn: null,
      winner: null
    });
    setCurrentEnteringPlayerIdx(0);
    setLocalContactsInput(Array(10).fill(''));
    setRevealInputs(Array(10).fill(false));
  };

  const addLocalPlayer = () => {
    playSound('click');
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    if (localPlayers.length >= 10) {
      alert('الحد الأقصى للاعبين هو 10.');
      return;
    }
    setLocalPlayers([...localPlayers, trimmed]);
    setNewPlayerName('');
  };

  const removeLocalPlayer = (index) => {
    playSound('click');
    if (localPlayers.length <= 3) {
      alert('الحد الأدنى للاعبين هو 3.');
      return;
    }
    setLocalPlayers(localPlayers.filter((_, idx) => idx !== index));
  };

  const autoFillFakeNames = (isOnline = false) => {
    const categoriesArray = isOnline 
      ? roomState?.selectedCategories 
      : localGameState?.selectedCategories;
      
    if (!categoriesArray) return;
    
    const categoryToFakeName = {
      "مامتك أو باباك": "ماما / بابا 👨‍👩‍👦",
      "مدرسك القديم": "مستر علي 👨‍🏫",
      "مديرك في الشغل": "المدير مصطفى 💼",
      "الكراش": "سارة الكراش 💖",
      "الإكس (The Ex)": "خالد الإكس 💔",
      "البارتنر أو حبيبك الحالي": "ياسمين البارتنر 💍",
      "ثالث حد في سجل المكالمات (Call log)": "الرقم الثالث مكالمات 📞",
      "خامس حد في سجل المكالمات": "الرقم الخامس مكالمات 📞",
      "حد بقالك سنة مكلمتوش": "أحمد من سنة مكلمتوش ⏳",
      "آخر رقم غريب اتصل بيك": "رقم غريب الدليفري 🛵",
      "ألف / اختار أي رقم غريب عشوائي": "رقم عشوائي غريب 📱",
      "شخص عملك جوستينج (Ghosting / اختفى ومبقاش يرد)": "حسن الجوست 👻",
      "حد استندل معاك قبل كده": "صاحب استندل معايا 🐍",
      "حد بعتلك على الواتساب ومردتش عليه": "مسدج واتس معلقة 💬",
      "صاحبك اللي مش معاك دلوقتي": "محمود الغايب 🚶‍♂️",
      "شخص عصبي جداً": "عصام نرفوز 😡",
      "آخر حد اتخانقت معاه": "علاء خناقة 🥊",
      "آخر حد اتجوز وماعزمكش": "عريس من غير عومة 💍",
      "آخر حد اتعرفت عليه": "زميل جديد 🤝",
      "آخر حد قابلته صدفة": "شفتة صدفة 🏃‍♂️",
      "قريب حد من صحابك": "قريب صاحبي 👥",
      "قريبك من بعيد": "ابن خالتي البعيد 🧬",
      "حد مبطقهوش من قرايبك": "قريب رخم 😈",
      "أكتر حد قمّاص تعرفه": "عماد قمّاص 🥺",
      "حد كان معاك في المدرسة": "زميل الدكة القديم 🎒",
      "اللي كان بيتنمر عليك وانت صغير": "البلطجي رجب 👹",
      "صاحب أبوك": "عمو حسين صاحب بابا 🧔",
      "جدك أو جدتك": "جدو العزيز 👴",
      "السوبر ماركت أو بتاع الدليفري": "دليفري الأكل 🛵",
      "أقرب صحاب البارتنر": "صاحب البارتنر المقرب 🤫"
    };

    const filledNames = categoriesArray.map(cat => {
      return categoryToFakeName[cat] || `وهمي: ${cat.substring(0, 15)}`;
    });

    if (isOnline) {
      setOnlineContactsInput(filledNames);
    } else {
      setLocalContactsInput(filledNames);
    }
  };

  const submitLocalNames = () => {
    playSound('click');
    // Validate inputs
    if (localContactsInput.some(name => !name.trim())) {
      alert('الرجاء إدخال كافة الأسماء الـ 10 للبدء.');
      return;
    }

    const updatedPlayers = [...localGameState.players];
    updatedPlayers[currentEnteringPlayerIdx].contacts = [...localContactsInput];

    // If there is a next player to enter names
    if (currentEnteringPlayerIdx < updatedPlayers.length - 1) {
      setLocalGameState({
        ...localGameState,
        players: updatedPlayers
      });
      setCurrentEnteringPlayerIdx(currentEnteringPlayerIdx + 1);
      setLocalContactsInput(Array(10).fill(''));
      setRevealInputs(Array(10).fill(false));
    } else {
      // All players have entered contacts, start the game!
      // Distribute hands
      let actDeck = [...localActionDeck];
      updatedPlayers.forEach(p => {
        p.hand = drawCards(actDeck, 5, allActionCards);
      });
      setLocalActionDeck(actDeck);

      setLocalGameState({
        ...localGameState,
        status: 'playing',
        players: updatedPlayers,
        turnIndex: 0,
        currentTurn: {
          numberCard: null,
          victimName: null,
          leftPlayerId: null,
          submittedCards: [], // in Local P&P, we just show all non-active players' hand to let them pick
          chosenCard: null,
          chosenCardOwnerId: null,
          emergencyCard: null,
          stage: 'draw' // 'draw' | 'wait_victim' | 'choose_card' | 'execute'
        }
      });
      setCardFlipped(false);
    }
  };

  const localDrawNumberCard = () => {
    playSound('flip');
    const activePlayer = localGameState.players[localGameState.turnIndex];
    const drawVal = Math.floor(Math.random() * 11) + 1; // 1 to 11
    let numberCard;
    let victimName = null;
    let leftPlayerId = null;
    let stage = 'execute'; // Go straight to execute!

    // Draw one action card from the deck
    let actDeck = [...localActionDeck];
    const chosenCard = drawCards(actDeck, 1, allActionCards)[0];
    setLocalActionDeck(actDeck);

    if (drawVal === 11) {
      numberCard = 'Nobody';
      const leftIndex = (localGameState.turnIndex + 1) % localGameState.players.length;
      leftPlayerId = localGameState.players[leftIndex].id;
      stage = 'wait_victim';
    } else {
      numberCard = drawVal;
      victimName = activePlayer.contacts[numberCard - 1] || "شخص غير معروف";
    }

    setLocalGameState({
      ...localGameState,
      currentTurn: {
        numberCard,
        victimName,
        leftPlayerId,
        chosenCard,
        chosenCardOwnerId: null,
        emergencyCard: null,
        stage
      }
    });

    // Animate flip card
    setTimeout(() => {
      setCardFlipped(true);
    }, 100);
  };

  const submitLocalNobodyVictim = () => {
    playSound('click');
    if (!selectedNobodyVictimName.trim()) {
      alert('الرجاء إدخال اسم الضحية.');
      return;
    }
    playSound('flip');
    setLocalGameState({
      ...localGameState,
      currentTurn: {
        ...localGameState.currentTurn,
        victimName: selectedNobodyVictimName,
        stage: 'execute' // Move straight to execution!
      }
    });
    setSelectedNobodyVictimName('');
  };

  const localExecuteSuccess = () => {
    const updatedPlayers = [...localGameState.players];
    const activePlayer = updatedPlayers[localGameState.turnIndex];
    
    // Add 50 pts
    activePlayer.score += 50;

    // Check Win
    if (activePlayer.score >= 250) {
      playSound('gameover');
      // Punishments: Assign emergency card to all other players
      let emgDeck = [...localEmergencyDeck];
      const gameWinner = activePlayer;
      
      const playersWithPunishments = updatedPlayers.map(p => {
        if (p.id !== gameWinner.id) {
          const pun = drawCards(emgDeck, 1, allEmergencyCards)[0];
          return { ...p, punishment: pun.text };
        }
        return p;
      });

      setLocalEmergencyDeck(emgDeck);
      setLocalGameState({
        ...localGameState,
        status: 'game_over',
        players: playersWithPunishments,
        winner: gameWinner
      });
    } else {
      playSound('success');
      // Next turn
      setLocalGameState({
        ...localGameState,
        players: updatedPlayers,
        turnIndex: (localGameState.turnIndex + 1) % updatedPlayers.length,
        currentTurn: {
          numberCard: null,
          victimName: null,
          leftPlayerId: null,
          submittedCards: [],
          chosenCard: null,
          chosenCardOwnerId: null,
          emergencyCard: null,
          stage: 'draw'
        }
      });
      setCardFlipped(false);
    }
  };

  const localChickenOut = () => {
    playSound('emergency');
    let emgDeck = [...localEmergencyDeck];
    const emergencyCard = drawCards(emgDeck, 1, allEmergencyCards)[0];
    setLocalEmergencyDeck(emgDeck);

    setLocalGameState({
      ...localGameState,
      currentTurn: {
        ...localGameState.currentTurn,
        emergencyCard
      }
    });
  };

  const localExecuteEmergency = () => {
    const updatedPlayers = [...localGameState.players];
    const activePlayer = updatedPlayers[localGameState.turnIndex];

    // Add 20 pts
    activePlayer.score += 20;

    // Check Win
    if (activePlayer.score >= 250) {
      playSound('gameover');
      let emgDeck = [...localEmergencyDeck];
      const gameWinner = activePlayer;
      const playersWithPunishments = updatedPlayers.map(p => {
        if (p.id !== gameWinner.id) {
          const pun = drawCards(emgDeck, 1, allEmergencyCards)[0];
          return { ...p, punishment: pun.text };
        }
        return p;
      });

      setLocalEmergencyDeck(emgDeck);
      setLocalGameState({
        ...localGameState,
        status: 'game_over',
        players: playersWithPunishments,
        winner: gameWinner
      });
    } else {
      playSound('success');
      // Next turn
      setLocalGameState({
        ...localGameState,
        players: updatedPlayers,
        turnIndex: (localGameState.turnIndex + 1) % updatedPlayers.length,
        currentTurn: {
          numberCard: null,
          victimName: null,
          leftPlayerId: null,
          submittedCards: [],
          chosenCard: null,
          chosenCardOwnerId: null,
          emergencyCard: null,
          stage: 'draw'
        }
      });
      setCardFlipped(false);
    }
  };

  const resetLocalGame = () => {
    playSound('click');
    setLocalGameState(null);
    setMode('select');
  };

  // --- ONLINE GAME ACTION EMITS ---

  const createOnlineRoom = async () => {
    if (!onlineName.trim()) {
      alert('الرجاء كتابة اسمك أولاً.');
      return;
    }
    playSound('click');
    
    // Generate 4-character room code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let roomCode = '';
    for (let i = 0; i < 4; i++) {
      roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const selectedCats = shuffle(allCategories).slice(0, 10);
    const initialRoomState = {
      code: roomCode,
      status: 'lobby',
      players: [
        {
          id: myPlayerId,
          playerId: myPlayerId,
          name: onlineName.trim(),
          contacts: [],
          hand: [],
          score: 0,
          isHost: true,
          isReady: false,
          lastActive: Date.now()
        }
      ],
      selectedCategories: selectedCats,
      turnIndex: 0,
      currentTurn: null,
      actionDeck: shuffle(allActionCards),
      emergencyDeck: shuffle(allEmergencyCards),
      winner: null
    };

    try {
      const roomRef = doc(db, 'rooms', roomCode);
      await setDoc(roomRef, initialRoomState);
      
      localStorage.setItem('send_player_name', onlineName.trim());
      localStorage.setItem('send_room_code', roomCode);
      setOnlineRoomCode(roomCode);
      setRoomState(initialRoomState);
      console.log(`Room created successfully on Firestore: ${roomCode}`);
    } catch (err) {
      console.error("Error creating room on Firestore:", err);
      alert("حدث خطأ أثناء إنشاء الغرفة. يرجى المحاولة مرة أخرى.");
    }
  };

  const joinOnlineRoom = async () => {
    if (!onlineName.trim() || !roomCodeInput.trim()) {
      alert('الرجاء كتابة اسمك وكود الغرفة للاتصال.');
      return;
    }
    playSound('click');
    const rCode = roomCodeInput.trim().toUpperCase();
    const roomRef = doc(db, 'rooms', rCode);

    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) {
          throw new Error('غرفة غير موجودة. تأكد من الكود.');
        }

        const room = sfDoc.data();
        if (room.status !== 'lobby') {
          throw new Error('اللعبة بدأت بالفعل في هذه الغرفة.');
        }

        if (room.players.length >= 10) {
          throw new Error('الغرفة ممتلئة (الحد الأقصى 10 لاعبين).');
        }

        // Add player if they aren't already in
        const exists = room.players.some(p => p.playerId === myPlayerId);
        if (!exists) {
          room.players.push({
            id: myPlayerId,
            playerId: myPlayerId,
            name: onlineName.trim(),
            contacts: [],
            hand: [],
            score: 0,
            isHost: false,
            isReady: false,
            lastActive: Date.now()
          });
        }

        transaction.update(roomRef, { players: room.players });
      });

      localStorage.setItem('send_player_name', onlineName.trim());
      localStorage.setItem('send_room_code', rCode);
      setOnlineRoomCode(rCode);
      setMode('online');
      console.log(`Joined room successfully: ${rCode}`);
    } catch (err) {
      console.error("Error joining room:", err);
      alert(err.message || "حدث خطأ أثناء الانضمام للغرفة.");
    }
  };

  const startOnlineNameEntry = async () => {
    playSound('click');
    if (!onlineRoomCode) return;
    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await updateDoc(roomRef, { status: 'name_entry' });
    } catch (err) {
      console.error("Error starting name entry:", err);
    }
  };

  const submitOnlineNames = async () => {
    playSound('click');
    if (!onlineRoomCode || onlineContactsInput.some(name => !name.trim())) {
      alert('الرجاء ملء كل الخانات الـ 10 للأسماء.');
      return;
    }

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        const player = room.players.find(p => p.playerId === myPlayerId);
        if (!player) return;

        player.contacts = [...onlineContactsInput];
        player.isReady = true;

        // Check if all players are ready
        const allReady = room.players.every(p => p.isReady);
        if (allReady) {
          // Distribute cards
          let actDeck = [...room.actionDeck];
          room.players.forEach(p => {
            p.hand = drawCards(actDeck, 5, allActionCards);
          });
          room.actionDeck = actDeck;
          room.status = 'playing';
          room.turnIndex = 0;
          room.currentTurn = {
            numberCard: null,
            victimName: null,
            leftPlayerId: null,
            chosenCard: null,
            emergencyCard: null,
            stage: 'draw'
          };
        }

        transaction.update(roomRef, {
          players: room.players,
          actionDeck: room.actionDeck,
          status: room.status,
          turnIndex: room.turnIndex,
          currentTurn: room.currentTurn
        });
      });
    } catch (err) {
      console.error("Error submitting names:", err);
    }
  };

  const drawOnlineNumberCard = async () => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        const activePlayer = room.players[room.turnIndex];
        if (activePlayer.playerId !== myPlayerId) return;

        const drawVal = Math.floor(Math.random() * 11) + 1; // 1 to 11
        let numberCard;
        let victimName = null;
        let leftPlayerId = null;
        let stage = 'execute';

        // Draw exactly one action card from the deck
        let actDeck = [...room.actionDeck];
        const chosenCard = drawCards(actDeck, 1, allActionCards)[0];
        room.actionDeck = actDeck;

        if (drawVal === 11) {
          numberCard = 'Nobody';
          const leftIndex = (room.turnIndex + 1) % room.players.length;
          leftPlayerId = room.players[leftIndex].playerId;
          stage = 'wait_victim';
        } else {
          numberCard = drawVal;
          victimName = activePlayer.contacts[numberCard - 1] || "شخص غير معروف";
        }

        room.currentTurn = {
          numberCard,
          victimName,
          leftPlayerId,
          chosenCard,
          emergencyCard: null,
          stage
        };

        transaction.update(roomRef, {
          actionDeck: room.actionDeck,
          currentTurn: room.currentTurn
        });
      });

      setTimeout(() => {
        setCardFlipped(true);
      }, 150);
    } catch (err) {
      console.error("Error drawing number card:", err);
    }
  };

  const submitOnlineNobodyVictim = async () => {
    playSound('click');
    if (!onlineRoomCode || !onlineNobodyVictim.trim() || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        if (room.currentTurn.leftPlayerId !== myPlayerId) return;

        room.currentTurn.victimName = onlineNobodyVictim.trim();
        room.currentTurn.stage = 'execute';

        transaction.update(roomRef, { currentTurn: room.currentTurn });
      });
      setOnlineNobodyVictim('');
    } catch (err) {
      console.error("Error submitting nobody victim:", err);
    }
  };

  const executeOnlineSuccess = async () => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        const activePlayer = room.players[room.turnIndex];
        if (activePlayer.playerId !== myPlayerId) return;

        activePlayer.score += 50;

        if (activePlayer.score >= 250) {
          room.status = 'game_over';
          room.winner = activePlayer;
        } else {
          room.turnIndex = (room.turnIndex + 1) % room.players.length;
          room.currentTurn = {
            numberCard: null,
            victimName: null,
            leftPlayerId: null,
            chosenCard: null,
            emergencyCard: null,
            stage: 'draw'
          };
        }

        transaction.update(roomRef, {
          players: room.players,
          status: room.status,
          winner: room.winner,
          turnIndex: room.turnIndex,
          currentTurn: room.currentTurn
        });
      });
    } catch (err) {
      console.error("Error executing success:", err);
    }
  };

  const chickenOnlineOut = async () => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        const activePlayer = room.players[room.turnIndex];
        if (activePlayer.playerId !== myPlayerId) return;

        let emgDeck = [...room.emergencyDeck];
        const emergencyCard = drawCards(emgDeck, 1, allEmergencyCards)[0];
        room.emergencyDeck = emgDeck;

        room.currentTurn.emergencyCard = emergencyCard;

        transaction.update(roomRef, {
          emergencyDeck: room.emergencyDeck,
          currentTurn: room.currentTurn
        });
      });
    } catch (err) {
      console.error("Error chickening out:", err);
    }
  };

  const executeOnlineEmergency = async () => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        const activePlayer = room.players[room.turnIndex];
        if (activePlayer.playerId !== myPlayerId) return;

        activePlayer.score += 20;

        if (activePlayer.score >= 250) {
          room.status = 'game_over';
          room.winner = activePlayer;
        } else {
          room.turnIndex = (room.turnIndex + 1) % room.players.length;
          room.currentTurn = {
            numberCard: null,
            victimName: null,
            leftPlayerId: null,
            chosenCard: null,
            emergencyCard: null,
            stage: 'draw'
          };
        }

        transaction.update(roomRef, {
          players: room.players,
          status: room.status,
          winner: room.winner,
          turnIndex: room.turnIndex,
          currentTurn: room.currentTurn
        });
      });
    } catch (err) {
      console.error("Error executing emergency:", err);
    }
  };

  const restartOnlineGame = async () => {
    playSound('click');
    if (!onlineRoomCode) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        room.status = 'lobby';
        room.winner = null;
        room.selectedCategories = shuffle(allCategories).slice(0, 10);
        room.actionDeck = shuffle(allActionCards);
        room.emergencyDeck = shuffle(allEmergencyCards);
        
        room.players.forEach(p => {
          p.score = 0;
          p.contacts = [];
          p.hand = [];
          p.isReady = false;
        });

        transaction.update(roomRef, {
          status: room.status,
          winner: room.winner,
          selectedCategories: room.selectedCategories,
          actionDeck: room.actionDeck,
          emergencyDeck: room.emergencyDeck,
          players: room.players
        });
      });

      setOnlineContactsInput(Array(10).fill(''));
      setOnlineRevealInputs(Array(10).fill(false));
    } catch (err) {
      console.error("Error restarting game:", err);
    }
  };

  const leaveOnlineRoom = async () => {
    playSound('click');
    if (!onlineRoomCode) return;
    
    const roomRef = doc(db, 'rooms', onlineRoomCode);
    const currentCode = onlineRoomCode;

    // Reset local states first
    localStorage.removeItem('send_room_code');
    localStorage.removeItem('send_player_name');
    setOnlineRoomCode('');
    setRoomState(null);
    setMode('select');

    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        const playerIndex = room.players.findIndex(p => p.playerId === myPlayerId);
        
        if (playerIndex !== -1) {
          const leavingPlayer = room.players[playerIndex];
          room.players.splice(playerIndex, 1);

          if (room.players.length === 0) {
            transaction.delete(roomRef);
            console.log(`Room ${currentCode} deleted because it has no players.`);
          } else {
            if (leavingPlayer.isHost) {
              room.players[0].isHost = true;
            }
            if (room.status === 'playing') {
              if (room.turnIndex >= room.players.length) {
                room.turnIndex = 0;
              }
              // Reset turn if active player left
              if (room.players[room.turnIndex].playerId === leavingPlayer.playerId) {
                room.currentTurn = {
                  numberCard: null,
                  victimName: null,
                  leftPlayerId: null,
                  chosenCard: null,
                  emergencyCard: null,
                  stage: 'draw'
                };
              }
            }
            transaction.update(roomRef, { players: room.players, turnIndex: room.turnIndex, currentTurn: room.currentTurn });
          }
        }
      });
    } catch (err) {
      console.error("Error leaving room:", err);
    }
  };

  // Utility to copy code
  const copyRoomCode = () => {
    if (!roomState) return;
    navigator.clipboard.writeText(roomState.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // --- UI RENDER CONDITIONAL VIEWS ---

  return (
    <div className="app-container" dir="rtl">
      <header>
        <div className="logo-container">
          <span className="logo-text">SEND</span>
        </div>
        <div className="subtitle">تافة زي هاها شرير زي هيهي</div>
      </header>

      {errorMessage && (
        <div className="glass-panel" style={{ borderColor: 'var(--danger)', color: '#f87171', textAlign: 'center' }}>
          {errorMessage}
        </div>
      )}

      {/* Restore Session Banner */}
      {mode === 'select' && localStorage.getItem('send_room_code') && (
        <div className="glass-panel restore-banner">
          <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}>🔄 لعبة غير مكتملة</span>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.4' }}>
            تم العثور على جلسة لعب سابقة في الغرفة **{localStorage.getItem('send_room_code')}** باسم **{localStorage.getItem('send_player_name')}**. هل تريد استئناف اللعب؟
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" style={{ flex: 2, fontSize: '0.95rem', padding: '0.65rem 1rem' }} onClick={handleRestoreSession}>
              نعم، العودة للغرفة 👍
            </button>
            <button className="btn btn-outline" style={{ flex: 1, fontSize: '0.95rem', padding: '0.65rem 1rem' }} onClick={handleDiscardSession}>
              تجاهل ❌
            </button>
          </div>
        </div>
      )}

      {/* 1. WELCOME SCREEN: Select Mode */}
      {mode === 'select' && (
        <div className="glass-panel">
          <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', fontWeight: 800 }}>اختر طريقة اللعب</h2>
          
          <div className="mode-card active" onClick={() => {
            setMode('local');
            setLocalPlayers(['لاعب 1', 'لاعب 2', 'لاعب 3']);
          }}>
            <div className="mode-icon">📱</div>
            <div className="mode-title">لعب محلي (موبايل واحد)</div>
            <div className="mode-desc">
              تليفون واحد بيلف على كل اللاعيبة في القعدة. كل واحد بيدخل أسماء جهات الاتصال بتاعته سرياً ويبدأ التحدي.
            </div>
          </div>

          <div className="mode-card" onClick={() => {
            setMode('online');
            setOnlineContactsInput(Array(10).fill(''));
          }}>
            <div className="mode-icon">🌐</div>
            <div className="mode-title">لعب أونلاين (عن بعد)</div>
            <div className="mode-desc">
              اعمل غرفة مع أصحابك. كل لاعب يدخل من موبايله بكود الغرفة، ونفذوا الأحكام مع بعض لايف!
            </div>
          </div>
        </div>
      )}

      {/* 2. LOCAL GAME SCREENS */}
      {mode === 'local' && (
        <>
          {/* A. Local Lobby (Add/Remove Players) */}
          {!localGameState && (
            <div className="glass-panel">
              <h2 style={{ marginBottom: '1.25rem', fontWeight: 800 }}>تجهيز القائمة المحلية</h2>
              
              <div className="form-group">
                <label>أضف اللاعبين (3 إلى 10 لاعبين):</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="text-input"
                    style={{ flex: 1 }}
                    placeholder="اسم اللاعب"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addLocalPlayer()}
                  />
                  <button className="btn btn-primary" onClick={addLocalPlayer}>أضف</button>
                </div>
              </div>

              <div style={{ margin: '1rem 0' }}>
                {localPlayers.map((name, index) => (
                  <div key={index} className="lobby-player-row" style={{ marginBottom: '0.5rem' }}>
                    <span>{name}</span>
                    <button
                      className="privacy-toggle"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => removeLocalPlayer(index)}
                    >
                      ❌
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setMode('select')}>رجوع</button>
                <button
                  className={`btn btn-secondary ${localPlayers.length < 3 ? 'btn-disabled' : ''}`}
                  style={{ flex: 2 }}
                  onClick={startLocalSetup}
                  disabled={localPlayers.length < 3}
                >
                  ابدأ التجهيز
                </button>
              </div>
            </div>
          )}

          {/* B. Local Name Entry (Privacy Shields) */}
          {localGameState && localGameState.status === 'name_entry' && (
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ fontWeight: 800 }}>تجهيز الأسماء</h2>
                <div className="turn-badge">دور: {localGameState.players[currentEnteringPlayerIdx].name}</div>
              </div>
              
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                اكتب 10 أسماء حقيقية من الـ Contacts عندك تطابق التصنيفات دي بالترتيب. استخدم درع الخصوصية لإخفاء كتابتك.
              </p>

              <div style={{ maxHeight: '380px', overflowY: 'auto', paddingLeft: '0.5rem', marginBottom: '1.5rem' }}>
                {localGameState.selectedCategories.map((cat, idx) => (
                  <div key={idx} className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{idx + 1}. {cat}</span>
                      <button
                        type="button"
                        className="privacy-toggle"
                        onClick={() => {
                          const updated = [...revealInputs];
                          updated[idx] = !updated[idx];
                          setRevealInputs(updated);
                        }}
                      >
                        {revealInputs[idx] ? '👁️' : '🔒'}
                      </button>
                    </div>
                    <input
                      type={revealInputs[idx] ? 'text' : 'password'}
                      className="text-input"
                      placeholder="اسم الشخص من جهات الاتصال"
                      value={localContactsInput[idx]}
                      onChange={(e) => {
                        const updated = [...localContactsInput];
                        updated[idx] = e.target.value;
                        setLocalContactsInput(updated);
                      }}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-outline"
                style={{
                  width: '100%',
                  borderColor: 'rgba(234, 179, 8, 0.4)',
                  color: '#eab308',
                  fontSize: '0.95rem',
                  marginBottom: '0.75rem'
                }}
                onClick={() => autoFillFakeNames(false)}
              >
                🧪 ملء تلقائي للتجربة (مؤقت)
              </button>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={submitLocalNames}>
                {currentEnteringPlayerIdx < localGameState.players.length - 1 
                  ? 'حفظ وتمرير الهاتف للاعب التالي'
                  : 'ابدأ اللعب! 🎮'}
              </button>
            </div>
          )}

          {/* C. Local Play Screen */}
          {localGameState && localGameState.status === 'playing' && (
            <>
              {/* Turn Header */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div className="game-top-bar">
                  <div className="turn-badge">المستهدف: {localGameState.players[localGameState.turnIndex].name}</div>
                  <div className="score-badge">النقاط: {localGameState.players[localGameState.turnIndex].score} / 250</div>
                </div>
              </div>

              {/* Step 1: Draw Card */}
              {localGameState.currentTurn.stage === 'draw' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  <h3 style={{ marginBottom: '1rem' }}>اسحب كارت الرقم لتحديد الضحية</h3>
                  
                  <div className="card-scene" onClick={localDrawNumberCard}>
                    <div className="flip-card">
                      <div className="card-face card-back">
                        <div className="card-back-pattern">SEND</div>
                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '1rem' }}>اضغط للسحب</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reveal Target & Flip animation display */}
              {(localGameState.currentTurn.stage === 'execute' || localGameState.currentTurn.stage === 'wait_victim') && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  <div className="card-scene">
                    <div className={`flip-card ${cardFlipped ? 'is-flipped' : ''}`}>
                      <div className="card-face card-back">
                        <div className="card-back-pattern">SEND</div>
                      </div>
                      <div className="card-front card-face">
                        <div className="card-front-label">رقم كارت الضحية</div>
                        {localGameState.currentTurn.numberCard === 'Nobody' ? (
                          <div className="card-front-nobody">Nobody</div>
                        ) : (
                          <div className="card-front-number">{localGameState.currentTurn.numberCard}</div>
                        )}
                        <div className="card-front-label">
                          {localGameState.currentTurn.numberCard === 'Nobody' ? 'مفيش ضحية من عندك!' : 'الضحية من قائمتك'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {localGameState.currentTurn.stage === 'wait_victim' && (
                    <div className="target-reveal">
                      <p style={{ color: 'var(--text-secondary)' }}>
                        بما أنه طلع كارت **Nobody**، اللاعب اللي على شمالك ({
                          localGameState.players[(localGameState.turnIndex + 1) % localGameState.players.length].name
                        }) هيختارلك ضحية من القايمة بتاعته هو!
                      </p>
                      <div className="form-group" style={{ marginTop: '1rem' }}>
                        <input
                          type="text"
                          className="text-input"
                          placeholder="اكتب اسم الضحية من قائمتك"
                          value={selectedNobodyVictimName}
                          onChange={(e) => setSelectedNobodyVictimName(e.target.value)}
                        />
                      </div>
                      <button className="btn btn-secondary" style={{ width: '100%' }} onClick={submitLocalNobodyVictim}>
                        تأكيد الضحية
                      </button>
                    </div>
                  )}

                  {localGameState.currentTurn.stage !== 'wait_victim' && (
                    <div className="target-reveal">
                      <div>الضحية هي:</div>
                      <div className="target-name">{localGameState.currentTurn.victimName}</div>
                      {localGameState.currentTurn.numberCard !== 'Nobody' && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          التصنيف: {localGameState.selectedCategories[localGameState.currentTurn.numberCard - 1]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Execute Action Card */}
              {localGameState.currentTurn.stage === 'execute' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  {!localGameState.currentTurn.emergencyCard ? (
                    <>
                      <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>الحكم المطلوب تنفيذه</h3>
                      <div className="dare-card" style={{ cursor: 'default', margin: '1rem 0' }}>
                        <span className={`dare-card-type ${localGameState.currentTurn.chosenCard.type.includes('فويس') ? 'voice' : localGameState.currentTurn.chosenCard.type.includes('مسدج') || localGameState.currentTurn.chosenCard.type.includes('رسالة') ? 'message' : 'call'}`}>
                          {localGameState.currentTurn.chosenCard.type}
                        </span>
                        <div className="dare-card-text" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                          {localGameState.currentTurn.chosenCard.text}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--warning)', marginTop: '0.5rem' }}>
                          المستهدف بالتواصل: <strong style={{ textDecoration: 'underline' }}>{localGameState.currentTurn.victimName}</strong>
                        </div>
                      </div>

                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                        تنبيه: يجب تنفيذ الحكم بجدية كاملة دون حذف الرسالة أو الفويس أو الاتصال حتى انتهاء اللعبة!
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <button className="btn btn-success" onClick={localExecuteSuccess}>
                          نفذت الحكم بجدية (+50 نقطة)
                        </button>
                        <button className="btn btn-danger" onClick={localChickenOut}>
                          هخلع (انسحاب طوارئ)
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="emergency-card-container" style={{ padding: '1.25rem', borderRadius: '20px' }}>
                      <div className="emergency-header">🚨 مخرج الطوارئ: هخلع</div>
                      <p style={{ fontSize: '1.05rem', margin: '1rem 0', lineHeight: '1.5', fontWeight: 600 }}>
                        {localGameState.currentTurn.emergencyCard.text}
                      </p>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
                        <button className="btn btn-secondary" onClick={localExecuteEmergency}>
                          نفذت كارت هخلع (+20 نقطة)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Local Scoreboard Display */}
              <div className="glass-panel scoreboard">
                <div className="scoreboard-title">لوحة النقاط (الهدف: 250 نقطة)</div>
                {localGameState.players.map(p => (
                  <div key={p.id} className="score-row">
                    <div className="score-row-meta">
                      <span>{p.name} {p.id === localGameState.players[localGameState.turnIndex].id && '👈'}</span>
                      <span>{p.score} / 250</span>
                    </div>
                    <div className="score-progress-container">
                      <div
                        className="score-progress-bar"
                        style={{ width: `${Math.min(100, (p.score / 250) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
                
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', marginTop: '1.5rem' }}
                  onClick={resetLocalGame}
                >
                  إنهاء اللعبة والعودة للرئيسية
                </button>
              </div>
            </>
          )}

          {/* D. Local Game Over */}
          {localGameState && localGameState.status === 'game_over' && (
            <div className="glass-panel" style={{ textAlign: 'center' }}>
              <ConfettiEffect />
              <div className="winner-box">
                <div className="winner-crown">👑</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>الفائز بالجيم هو</div>
                <div className="winner-name">{localGameState.winner.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  النقاط: {localGameState.winner.score} نقطة
                </div>
              </div>

              <h3 style={{ margin: '1.5rem 0 1rem 0', fontWeight: 800, color: 'var(--danger)' }}>أحكام عقاب الخاسرين ("هخلع")</h3>
              <div className="punishment-box">
                {localGameState.players.map(p => {
                  if (p.id === localGameState.winner.id) return null;
                  return (
                    <div key={p.id} className="punishment-player-card">
                      <div style={{ fontWeight: 'bold', textAlign: 'right' }}>{p.name} (عقابه):</div>
                      <div className="punishment-text" style={{ textAlign: 'right' }}>{p.punishment}</div>
                    </div>
                  );
                })}
              </div>

              <button className="btn btn-primary" style={{ width: '100%', marginTop: '2rem' }} onClick={resetLocalGame}>
                اللعب مجدداً
              </button>
            </div>
          )}
        </>
      )}

      {/* 3. ONLINE GAME SCREENS */}
      {mode === 'online' && (
        <>
          {/* A. Connect screen (Create/Join room) */}
          {!roomState && (
            <div className="glass-panel">
              <h2 style={{ marginBottom: '1.5rem', fontWeight: 800 }}>إنشاء أو دخول غرفة أونلاين</h2>
              
              <div className="form-group">
                <label>اسمك المستعار:</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="مثال: أحمد"
                  value={onlineName}
                  onChange={(e) => setOnlineName(e.target.value)}
                />
              </div>

              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '1.5rem 0' }}></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={createOnlineRoom}>
                  أنشئ غرفة جديدة ➕
                </button>
              </div>

              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '1.5rem 0' }}></div>

              <div className="form-group">
                <label>أدخل كود الغرفة (4 حروف):</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="text-input"
                    style={{ flex: 1, fontFamily: 'var(--font-english)', textTransform: 'uppercase', textAlign: 'center', letterSpacing: '4px' }}
                    placeholder="CODE"
                    maxLength={4}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value)}
                  />
                  <button className="btn btn-outline" onClick={joinOnlineRoom}>دخول 🚪</button>
                </div>
              </div>

              <button className="btn btn-outline" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => setMode('select')}>
                رجوع للرئيسية
              </button>
            </div>
          )}

          {/* B. Lobby Screen (Waiting for players) */}
          {roomState && roomState.status === 'lobby' && (
            <div className="glass-panel">
              <h2 style={{ marginBottom: '1.25rem', fontWeight: 800 }}>غرفة الانتظار</h2>
              
              <div className="room-code-display">
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>كود الغرفة (اضغط للنسخ):</span>
                <span className="room-code" onClick={copyRoomCode} style={{ cursor: 'pointer' }}>
                  {roomState.code}
                </span>
                {copiedCode && <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>تم النسخ!</span>}
              </div>

              <h3 style={{ marginBottom: '0.75rem', fontWeight: 700 }}>اللاعبون المتصلون ({playersList.length}):</h3>
              <div className="lobby-players-list">
                {playersList.map(p => (
                  <div key={p.playerId} className="lobby-player-row" style={{ opacity: p.isDisconnected ? 0.5 : 1 }}>
                    <span className="lobby-player-name">
                      👤 {p.name} {p.isHost && <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>(المضيف)</span>}
                    </span>
                    {p.isDisconnected ? (
                      <span className="waiting-badge" style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>منقطع ⏳</span>
                    ) : (
                      <span className="waiting-badge">في الانتظار</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Display generated Categories preview */}
              <h3 style={{ marginBottom: '0.75rem', fontWeight: 700 }}>التصنيفات العشوائية للجيم:</h3>
              <div className="category-badge-list" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                {roomState.selectedCategories.map((cat, idx) => (
                  <div key={idx} className="category-item">
                    <span className="category-number">{idx + 1}</span>
                    <span>{cat}</span>
                  </div>
                ))}
              </div>

              {/* Host starts the game */}
              {playersList.find(p => p.playerId === myPlayerId)?.isHost ? (
                <button
                  className={`btn btn-secondary ${playersList.length < 3 ? 'btn-disabled' : ''}`}
                  style={{ width: '100%', marginTop: '1.5rem' }}
                  onClick={startOnlineNameEntry}
                  disabled={playersList.length < 3}
                >
                  ابدأ تجهيز الأسماء (3+ لاعبين)
                </button>
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '1.5rem' }}>
                  بإنتظار قيام مضيف الغرفة ببدء اللعب...
                </p>
              )}

              <button className="btn btn-outline" style={{ width: '100%', marginTop: '1rem' }} onClick={leaveOnlineRoom}>
                مغادرة الغرفة
              </button>
            </div>
          )}

          {/* C. Online Name Entry Screen */}
          {roomState && roomState.status === 'name_entry' && (
            <div className="glass-panel">
              <h2 style={{ marginBottom: '0.5rem', fontWeight: 800 }}>تجهيز جهات الاتصال الخاصة بك</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                املأ الـ 10 أسماء الحقيقية المقابلة للتصنيفات بالترتيب. لن يرى اللاعبون الآخرون الأسماء التي تدخلها.
              </p>

              {playersList.find(p => p.playerId === myPlayerId)?.isReady ? (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                  <h3>تم حفظ أسمائك بنجاح!</h3>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    بإنتظار باقي اللاعبين للانتهاء من كتابة أسمائهم...
                  </p>
                  <div style={{ marginTop: '1.5rem' }}>
                    {playersList.map(p => (
                      <div key={p.playerId} className="lobby-player-row" style={{ marginBottom: '0.5rem', opacity: p.isDisconnected ? 0.5 : 1 }}>
                        <span>
                          {p.name} {p.isDisconnected && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>(منقطع)</span>}
                        </span>
                        {p.isDisconnected ? (
                          <span className="waiting-badge" style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>منقطع ⏳</span>
                        ) : p.isReady ? (
                          <span className="ready-badge">جاهز</span>
                        ) : (
                          <span className="waiting-badge">يكتب الآن...</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ maxHeight: '350px', overflowY: 'auto', paddingLeft: '0.5rem', marginBottom: '1.5rem' }}>
                    {roomState.selectedCategories.map((cat, idx) => (
                      <div key={idx} className="form-group" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '14px', border: '1px solid var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{idx + 1}. {cat}</span>
                          <button
                            type="button"
                            className="privacy-toggle"
                            onClick={() => {
                              const updated = [...onlineRevealInputs];
                              updated[idx] = !updated[idx];
                              setOnlineRevealInputs(updated);
                            }}
                          >
                            {onlineRevealInputs[idx] ? '👁️' : '🔒'}
                          </button>
                        </div>
                        <input
                          type={onlineRevealInputs[idx] ? 'text' : 'password'}
                          className="text-input"
                          placeholder="اسم جهة الاتصال الحقيقية"
                          value={onlineContactsInput[idx]}
                          onChange={(e) => {
                            const updated = [...onlineContactsInput];
                            updated[idx] = e.target.value;
                            setOnlineContactsInput(updated);
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{
                      width: '100%',
                      borderColor: 'rgba(234, 179, 8, 0.4)',
                      color: '#eab308',
                      fontSize: '0.95rem',
                      marginBottom: '0.75rem'
                    }}
                    onClick={() => autoFillFakeNames(true)}
                  >
                    🧪 ملء تلقائي للتجربة (مؤقت)
                  </button>
                  <button className="btn btn-secondary" style={{ width: '100%' }} onClick={submitOnlineNames}>
                    حفظ وإرسال الأسماء
                  </button>
                </>
              )}
            </div>
          )}

          {/* D. Online Active Game Play Screen */}
          {roomState && roomState.status === 'playing' && (
            <>
              {/* Turn Banner */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div className="game-top-bar">
                  <div className="turn-badge">
                    {playersList[roomState.turnIndex]?.playerId === myPlayerId 
                      ? 'دورك أنت يا بطل! 😎' 
                      : `دور اللاعب: ${playersList[roomState.turnIndex]?.name}`}
                  </div>
                  <div className="score-badge">نقاطك: {playersList.find(p => p.playerId === myPlayerId)?.score || 0} / 250</div>
                </div>
              </div>

              {/* Active Player - Stage: Draw Card */}
              {playersList[roomState.turnIndex]?.playerId === myPlayerId && roomState.currentTurn.stage === 'draw' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  <h3 style={{ marginBottom: '1.25rem' }}>اضغط على الكارت لتسحب كارت الضحية</h3>
                  
                  <div className="card-scene" onClick={drawOnlineNumberCard}>
                    <div className="flip-card">
                      <div className="card-face card-back">
                        <div className="card-back-pattern">SEND</div>
                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '1rem' }}>سحب الكارت</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Non-Active Players - Stage: Draw Card */}
              {playersList[roomState.turnIndex]?.playerId !== myPlayerId && roomState.currentTurn.stage === 'draw' && (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1.25rem' }}>🎲</div>
                  <h3>بانتظار سحب كارت الرقم...</h3>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    يقوم اللاعب {playersList[roomState.turnIndex]?.name} بسحب كارت الرقم حالياً.
                  </p>
                </div>
              )}

              {/* Stage: Wait Victim (Only for Nobody card drawn) */}
              {roomState.currentTurn.stage === 'wait_victim' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  <div className="card-scene">
                    <div className={`flip-card ${cardFlipped ? 'is-flipped' : ''}`}>
                      <div className="card-face card-back">
                        <div className="card-back-pattern">SEND</div>
                      </div>
                      <div className="card-front card-face">
                        <div className="card-front-nobody">Nobody</div>
                        <div className="card-front-label">تم سحب كارت الـ Nobody!</div>
                      </div>
                    </div>
                  </div>

                  {roomState.currentTurn.leftPlayerId === myPlayerId ? (
                    <div className="target-reveal">
                      <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        أنت اللاعب اللي على شمال {playersList[roomState.turnIndex]?.name}!
                        اختر له ضحية من قائمة جهات الاتصال الخاصة بك.
                      </p>
                      <div className="form-group">
                        <select
                          className="text-input"
                          style={{ width: '100%', background: '#1e1b4b', color: 'white' }}
                          value={onlineNobodyVictim}
                          onChange={(e) => setOnlineNobodyVictim(e.target.value)}
                        >
                          <option value="">-- اختر ضحية من أسمائك --</option>
                          {playersList.find(p => p.playerId === myPlayerId)?.contacts?.map((name, i) => (
                            <option key={i} value={name}>{i+1}. {name} ({roomState.selectedCategories[i]})</option>
                          ))}
                        </select>
                      </div>
                      <button
                        className={`btn btn-secondary ${!onlineNobodyVictim ? 'btn-disabled' : ''}`}
                        style={{ width: '100%', marginTop: '0.5rem' }}
                        onClick={submitOnlineNobodyVictim}
                        disabled={!onlineNobodyVictim}
                      >
                        إرسال الضحية المحددة
                      </button>
                    </div>
                  ) : (
                    <div className="target-reveal">
                      <p style={{ color: 'var(--text-secondary)' }}>
                        بانتظار اللاعب {playersList.find(p => p.playerId === roomState.currentTurn.leftPlayerId)?.name} ليحدد الضحية من قائمته...
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Stage: Execute (Active player performs chosen card or emergency card) */}
              {roomState.currentTurn.stage === 'execute' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  {playersList[roomState.turnIndex]?.playerId === myPlayerId ? (
                    // Active player execution panel
                    !roomState.currentTurn.emergencyCard ? (
                      <>
                        <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>الحكم الموجه لك لتنفيذه</h3>
                        
                        <div className="dare-card" style={{ cursor: 'default', margin: '1rem 0' }}>
                          <span className={`dare-card-type ${roomState.currentTurn.chosenCard.type.includes('فويس') ? 'voice' : roomState.currentTurn.chosenCard.type.includes('مسدج') || roomState.currentTurn.chosenCard.type.includes('رسالة') ? 'message' : 'call'}`}>
                            {roomState.currentTurn.chosenCard.type}
                          </span>
                          <div className="dare-card-text" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                            {roomState.currentTurn.chosenCard.text}
                          </div>
                          <div style={{ fontSize: '0.9rem', color: 'var(--warning)', marginTop: '0.5rem' }}>
                            المستهدف بالتواصل: <strong>{roomState.currentTurn.victimName}</strong>
                          </div>
                        </div>

                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                          يجب إرسال الحكم للضحية بجدية تامة. وممنوع مسح الرسالة أو الاتصال طوال مدة اللعب!
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <button className="btn btn-success" onClick={executeOnlineSuccess}>
                            نفذت الحكم بجدية (+50 نقطة)
                          </button>
                          <button className="btn btn-danger" onClick={chickenOnlineOut}>
                            هخلع (انسحاب طوارئ)
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="emergency-card-container" style={{ padding: '1.25rem', borderRadius: '20px' }}>
                        <div className="emergency-header">🚨 مخرج الطوارئ: هخلع</div>
                        <p style={{ fontSize: '1.1rem', margin: '1rem 0', lineHeight: '1.5', fontWeight: 600 }}>
                          {roomState.currentTurn.emergencyCard.text}
                        </p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
                          <button className="btn btn-secondary" onClick={executeOnlineEmergency}>
                            نفذت كارت هخلع (+20 نقطة)
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    // Other players waiting during execution
                    <div style={{ padding: '1rem 0' }}>
                      <h3 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>الحكم قيد التنفيذ الآن...</h3>
                      <p>
                        يواجه اللاعب {playersList[roomState.turnIndex]?.name} الحكم التالي للتواصل مع {roomState.currentTurn.victimName}:
                      </p>
                      <div className="dare-card" style={{ cursor: 'default', margin: '1rem 0', opacity: 0.85 }}>
                        <span className={`dare-card-type ${roomState.currentTurn.chosenCard.type.includes('فويس') ? 'voice' : roomState.currentTurn.chosenCard.type.includes('مسدج') || roomState.currentTurn.chosenCard.type.includes('رسالة') ? 'message' : 'call'}`}>
                          {roomState.currentTurn.chosenCard.type}
                        </span>
                        <div className="dare-card-text">{roomState.currentTurn.chosenCard.text}</div>
                      </div>
                      
                      {roomState.currentTurn.emergencyCard && (
                        <div className="emergency-card-container" style={{ padding: '0.8rem', borderRadius: '14px', marginTop: '1rem' }}>
                          <div style={{ fontWeight: 'bold', color: '#ff8a8d' }}>🚨 انسحب ولجأ لكارت هخلع:</div>
                          <div style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>{roomState.currentTurn.emergencyCard.text}</div>
                        </div>
                      )}

                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
                        بانتظار قيام اللاعب بتأكيد إتمام التنفيذ...
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Online Scoreboard Overlay */}
              <div className="glass-panel scoreboard">
                <div className="scoreboard-title">لوحة النقاط (الهدف: 250 نقطة)</div>
                {playersList.map(p => (
                  <div key={p.playerId} className="score-row" style={{ opacity: p.isDisconnected ? 0.5 : 1 }}>
                    <div className="score-row-meta">
                      <span>
                        {p.name} {p.playerId === playersList[roomState.turnIndex]?.playerId && '👈'}
                        {p.isDisconnected && <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginRight: '0.5rem' }}>(منقطع)</span>}
                      </span>
                      <span>{p.score} / 250</span>
                    </div>
                    <div className="score-progress-container">
                      <div
                        className="score-progress-bar"
                        style={{ width: `${Math.min(100, (p.score / 250) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
                
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', marginTop: '1.5rem' }}
                  onClick={leaveOnlineRoom}
                >
                  الخروج من الغرفة
                </button>
              </div>
            </>
          )}

          {/* E. Online Game Over */}
          {roomState && roomState.status === 'game_over' && (
            <div className="glass-panel" style={{ textAlign: 'center' }}>
              <ConfettiEffect />
              <div className="winner-box">
                <div className="winner-crown">👑</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>بطل الجيم هو الفائز</div>
                <div className="winner-name">{roomState.winner.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  النقاط: {roomState.winner.score} نقطة
                </div>
              </div>

              <h3 style={{ margin: '1.5rem 0 1rem 0', fontWeight: 800, color: 'var(--danger)' }}>عقوبات اللاعبين الخاسرين ("هخلع")</h3>
              <div className="punishment-box">
                {playersList.map(p => {
                  if (p.playerId === roomState.winner.playerId) return null;
                  
                  // In online mode, we can show a random emergency card text assigned as punishment
                  const seedVal = p.name.charCodeAt(0) + p.score;
                  const punIndex = seedVal % allEmergencyCards.length;
                  const ptext = allEmergencyCards[punIndex].text;

                  return (
                    <div key={p.playerId} className="punishment-player-card">
                      <div style={{ fontWeight: 'bold', textAlign: 'right' }}>{p.name} (عقابه):</div>
                      <div className="punishment-text" style={{ textAlign: 'right' }}>{ptext}</div>
                    </div>
                  );
                })}
              </div>

              {playersList.find(p => p.playerId === myPlayerId)?.isHost ? (
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '2rem' }} onClick={restartOnlineGame}>
                  لعب مجدداً 🔄
                </button>
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>
                  بانتظار مضيف الغرفة لبدء جيم جديد...
                </p>
              )}

              <button className="btn btn-outline" style={{ width: '100%', marginTop: '1rem' }} onClick={leaveOnlineRoom}>
                الخروج للرئيسية
              </button>
            </div>
          )}
        </>
      )}

      {/* Dev Info Modal */}
      {showDevModal && (
        <div className="dev-modal-overlay" onClick={() => { setShowDevModal(false); setShowPhones(false); }}>
          <div className="dev-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="dev-modal-close" onClick={() => { setShowDevModal(false); setShowPhones(false); }}>×</button>
            <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem' }}>👨‍💻</div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem', color: 'var(--primary)' }}>Omar Adel</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>Full Stack Developer</p>
            
            <div className="dev-contacts">
              <a 
                href="https://www.instagram.com/jj3_xx?igsh=MWVkaGI5ZjNsb3Nreg%3D%3D&utm_source=qr" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="dev-contact-row instagram"
                onClick={() => playSound('click')}
              >
                <span>📸</span>
                <span>Instagram</span>
              </a>

              <a 
                href="https://wa.me/201099675196" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="dev-contact-row whatsapp"
                onClick={() => playSound('click')}
              >
                <span>💬</span>
                <span>WhatsApp</span>
              </a>

              <button 
                type="button"
                className="dev-contact-row phone-btn"
                style={{ cursor: 'pointer', width: '100%', border: '1px solid var(--border-light)', background: 'rgba(255, 255, 255, 0.03)', textAlign: 'left', outline: 'none' }}
                onClick={() => { playSound('click'); setShowPhones(!showPhones); }}
              >
                <span>📞</span>
                <span>Phone</span>
              </button>

              {showPhones && (
                <div className="dev-phones-dropdown">
                  <a href="tel:01050442007" className="dev-phone-item" onClick={() => playSound('click')}>
                    <span>📞</span>
                    <span>01050442007</span>
                  </a>
                  <a href="tel:01099675196" className="dev-phone-item" onClick={() => playSound('click')}>
                    <span>📞</span>
                    <span>01099675196</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dev Persistent Footer */}
      <footer className="dev-footer">
        Developed by <span className="dev-author-link" onClick={() => { playSound('click'); setShowDevModal(true); }}>Omar Adel</span>
      </footer>
    </div>
  );
}
