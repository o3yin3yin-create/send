import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { doc, setDoc, updateDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { categories as allCategories, actionCards as allActionCards, emergencyCards as allEmergencyCards, spyLocations as allSpyLocations } from './localGameData';
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

const xorEncryptDecrypt = (input, key) => {
  let output = '';
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    output += String.fromCharCode(charCode);
  }
  return output;
};

const encryptRole = (roleObj, key) => {
  const jsonStr = JSON.stringify(roleObj);
  const encrypted = xorEncryptDecrypt(jsonStr, key);
  return btoa(unescape(encodeURIComponent(encrypted)));
};

const decryptRole = (encryptedStr, key) => {
  try {
    const encrypted = decodeURIComponent(escape(atob(encryptedStr)));
    const jsonStr = xorEncryptDecrypt(encrypted, key);
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Decryption failed", e);
    return null;
  }
};

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
  const [activeGame, setActiveGame] = useState(null); // null (Hub) | 'send-101'

  // Generate or retrieve persistent player ID
  const [myPlayerId] = useState(() => {
    let pid = localStorage.getItem('send_player_id');
    if (!pid) {
      pid = Math.random().toString(36).substr(2, 9);
      localStorage.setItem('send_player_id', pid);
    }
    return pid;
  });

  const [myTempKey] = useState(() => {
    let key = localStorage.getItem('send_temp_key');
    if (!key) {
      key = Math.random().toString(36).substr(2, 9);
      localStorage.setItem('send_temp_key', key);
    }
    return key;
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
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  
  // --- SPY GAME STATE VARIABLES ---
  const [spyGameState, setSpyGameState] = useState(null);
  const [showHowToPlaySpy, setShowHowToPlaySpy] = useState(false);
  const [spyTimer, setSpyTimer] = useState(180);
  const [currentSpyRevealIdx, setCurrentSpyRevealIdx] = useState(0);
  const [isLocationRevealed, setIsLocationRevealed] = useState(false);
  const [spyAccusedPlayerId, setSpyAccusedPlayerId] = useState('');
  const [spyVotes, setSpyVotes] = useState({});
  const [spyGuessOptionSelected, setSpyGuessOptionSelected] = useState('');
  const [spyGuessOptions, setSpyGuessOptions] = useState([]);

  // Computed players list to track online/disconnected status dynamically
  const playersList = React.useMemo(() => {
    if (!roomState || !roomState.players) return [];
    const now = Date.now();
    return roomState.players.map(p => ({
      ...p,
      isDisconnected: p.playerId !== myPlayerId && (now - (p.lastActive || 0) > 20000)
    }));
  }, [roomState, myPlayerId]);

  const myDecryptedRole = React.useMemo(() => {
    if (!roomState || !roomState.players) return null;
    const me = roomState.players.find(p => p.playerId === myPlayerId);
    if (!me || !me.encryptedRole) return null;
    return decryptRole(me.encryptedRole, myTempKey);
  }, [roomState, myPlayerId, myTempKey]);

  // Subscribe to room updates in Firestore
  useEffect(() => {
    if (mode === 'online' && onlineRoomCode) {
      const roomRef = doc(db, 'rooms', onlineRoomCode);
      
      const unsubscribe = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const updatedState = docSnap.data();
          
          if (updatedState.gameType && updatedState.gameType !== activeGame) {
            setActiveGame(updatedState.gameType);
          }

          if (updatedState.spyGuess && updatedState.status !== 'game_over') {
            const me = updatedState.players.find(p => p.playerId === myPlayerId);
            if (me && me.encryptedRole) {
              const myRole = decryptRole(me.encryptedRole, myTempKey);
              if (myRole && !myRole.isSpy) {
                const isCorrect = updatedState.spyGuess === myRole.location;
                const spyPlayer = updatedState.players.find(p => p.playerId === updatedState.spyPlayerId);
                runTransaction(db, async (transaction) => {
                  const sfDoc = await transaction.get(roomRef);
                  if (!sfDoc.exists()) return;
                  const data = sfDoc.data();
                  if (data.spyGuess && data.status !== 'game_over') {
                    if (isCorrect) {
                      transaction.update(roomRef, {
                        status: 'game_over',
                        spyGuess: null,
                        winner: spyPlayer ? { id: spyPlayer.playerId, name: spyPlayer.name } : { id: 'spy', name: 'المتغفل' },
                        reason: `المتغفل عرف مكان الأغلبية صح وهو (${myRole.location})! المتغفل كسب الجيم.`
                      });
                    } else {
                      transaction.update(roomRef, {
                        status: 'game_over',
                        spyGuess: null,
                        winner: { id: 'group', name: 'الأغلبية (الجروب)' },
                        reason: `المتغفل خمن غلط (${data.spyGuess})! مكان الأغلبية كان (${myRole.location}). الأغلبية كسبت الجيم.`
                      });
                    }
                  }
                });
              }
            }
          }
          
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
  }, [mode, onlineRoomCode, activeGame, myPlayerId, myTempKey]);

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

  // Ensure tempKey is always present in Firestore players list when room is in lobby
  useEffect(() => {
    if (mode === 'online' && roomState && roomState.status === 'lobby' && onlineRoomCode) {
      const me = roomState.players.find(p => p.playerId === myPlayerId);
      if (me && !me.tempKey) {
        const roomRef = doc(db, 'rooms', onlineRoomCode);
        runTransaction(db, async (transaction) => {
          const sfDoc = await transaction.get(roomRef);
          if (!sfDoc.exists()) return;
          const data = sfDoc.data();
          if (data.status === 'lobby') {
            const players = data.players.map(p => {
              if (p.playerId === myPlayerId) {
                return { ...p, tempKey: myTempKey };
              }
              return p;
            });
            transaction.update(roomRef, { players });
          }
        });
      }
    }
  }, [mode, roomState?.status, roomState?.players, onlineRoomCode, myPlayerId, myTempKey]);

  // --- SPY GAME TIMER COUNTDOWN ---
  useEffect(() => {
    let interval = null;
    if (activeGame === 'el-motagafel') {
      if (mode === 'local' && spyGameState && spyGameState.status === 'playing') {
        if (spyTimer > 0) {
          interval = setInterval(() => {
            setSpyTimer(t => t - 1);
          }, 1000);
        }
      } else if (mode === 'online' && roomState && roomState.status === 'playing') {
        if (spyTimer > 0) {
          interval = setInterval(() => {
            setSpyTimer(t => t - 1);
          }, 1000);
        }
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeGame, mode, spyGameState, roomState, spyTimer]);

  useEffect(() => {
    if (activeGame === 'el-motagafel' && mode === 'online' && roomState) {
      if (roomState.status === 'playing' && roomState.gameStartedAt) {
        const elapsed = Math.floor((Date.now() - roomState.gameStartedAt) / 1000);
        const remaining = Math.max(0, 180 - elapsed);
        setSpyTimer(remaining);
      }
    }
  }, [roomState?.status, roomState?.gameStartedAt, activeGame, mode]);

  // --- LOCAL GAME LOGIC ACTIONS ---
  
  const startLocalSetup = () => {
    playSound('click');
    if (localPlayers.length < 3) {
      alert('لازم يكون فيه 3 لعيبة على الأقل عشان تلعبوا.');
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
      alert('آخركوا 10 لعيبة بس.');
      return;
    }
    setLocalPlayers([...localPlayers, trimmed]);
    setNewPlayerName('');
  };

  const removeLocalPlayer = (index) => {
    playSound('click');
    if (localPlayers.length <= 3) {
      alert('مينفعش تلعبوا بأقل من 3 لعيبة.');
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
      alert('لازم تكتب الـ 10 أسامي كلهم عشان تبدأوا.');
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
      alert('اختار الضحية الأول يا بطل.');
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

  // --- SPY LOCAL GAME LOGIC ACTIONS ---
  
  const startSpyLocalSetup = () => {
    playSound('click');
    if (localPlayers.length < 3) {
      alert('لازم يكون فيه 3 لعيبة على الأقل عشان تلعبوا.');
      return;
    }
    
    // Choose location pair
    const pair = allSpyLocations[Math.floor(Math.random() * allSpyLocations.length)];
    const isAForMajority = Math.random() > 0.5;
    const majorityLocation = isAForMajority ? pair.location_A : pair.location_B;
    const minorityLocation = isAForMajority ? pair.location_B : pair.location_A;
    
    // Select a spy
    const spyIdx = Math.floor(Math.random() * localPlayers.length);
    
    const players = localPlayers.map((name, idx) => ({
      id: Math.random().toString(36).substr(2, 9),
      name,
      location: idx === spyIdx ? minorityLocation : majorityLocation,
      isSpy: idx === spyIdx,
      score: 0
    }));
    
    // Generate 10 options for the spy to guess
    const options = new Set();
    options.add(majorityLocation);
    while (options.size < 10 && options.size < allSpyLocations.length * 2) {
      const randomLoc = allSpyLocations[Math.floor(Math.random() * allSpyLocations.length)];
      const randomName = Math.random() > 0.5 ? randomLoc.location_A : randomLoc.location_B;
      if (randomName !== majorityLocation) {
        options.add(randomName);
      }
    }
    setSpyGuessOptions(shuffle(Array.from(options)));
    
    setSpyGameState({
      status: 'reveal', // 'reveal' | 'playing' | 'voting' | 'guessing' | 'game_over'
      players,
      selectedPair: pair,
      spyPlayerId: players[spyIdx].id,
      majorityLocation,
      minorityLocation,
      winner: null,
      accusedPlayerId: null
    });
    
    setCurrentSpyRevealIdx(0);
    setIsLocationRevealed(false);
    setSpyTimer(180);
    setSpyAccusedPlayerId('');
    setSpyVotes({});
    setSpyGuessOptionSelected('');
  };

  const revealSpyLocationNext = () => {
    playSound('click');
    if (!spyGameState) return;
    if (currentSpyRevealIdx < spyGameState.players.length - 1) {
      setCurrentSpyRevealIdx(currentSpyRevealIdx + 1);
      setIsLocationRevealed(false);
    } else {
      setSpyGameState({
        ...spyGameState,
        status: 'playing'
      });
      playSound('flip');
    }
  };

  const handleLocalSpyVoteResult = (accusedId, didAccuseSpy) => {
    playSound('click');
    if (!spyGameState) return;
    const accusedPlayer = spyGameState.players.find(p => p.id === accusedId);
    if (!accusedPlayer) return;
    
    if (didAccuseSpy) {
      // If accused player is indeed the spy
      if (accusedPlayer.isSpy) {
        // Spy has one chance to guess
        setSpyGameState({
          ...spyGameState,
          status: 'guessing',
          accusedPlayerId: accusedId
        });
      } else {
        // Accused innocent player -> Spy wins!
        const spyPlayer = spyGameState.players.find(p => p.isSpy);
        setSpyGameState({
          ...spyGameState,
          status: 'game_over',
          winner: spyPlayer,
          reason: `اتهمتوا اللعيب البريء (${accusedPlayer.name})! المتغفل طلع كسبان.`
        });
        playSound('gameover');
      }
    } else {
      // Voting failed, return to discussion
      setSpyGameState({
        ...spyGameState,
        status: 'playing'
      });
    }
  };

  const submitLocalSpyGuess = (guessedLocation) => {
    playSound('click');
    if (!spyGameState) return;
    
    if (guessedLocation === spyGameState.majorityLocation) {
      // Spy guessed correctly -> Spy wins!
      const spyPlayer = spyGameState.players.find(p => p.isSpy);
      setSpyGameState({
        ...spyGameState,
        status: 'game_over',
        winner: spyPlayer,
        reason: `المتغفل عرف مكان الأغلبية صح وهو (${spyGameState.majorityLocation})! المتغفل كسب الجيم.`
      });
      playSound('gameover');
    } else {
      // Spy guessed wrong -> Group wins!
      setSpyGameState({
        ...spyGameState,
        status: 'game_over',
        winner: { id: 'group', name: 'الأغلبية (الجروب)' },
        reason: `المتغفل خمن غلط (${guessedLocation})! مكان الأغلبية كان (${spyGameState.majorityLocation}). الأغلبية كسبت الجيم.`
      });
      playSound('gameover');
    }
  };

  const handleLocalSpySelfReveal = (claimingPlayerId) => {
    playSound('click');
    if (!spyGameState) return;
    const claimingPlayer = spyGameState.players.find(p => p.id === claimingPlayerId);
    if (!claimingPlayer) return;
    
    if (claimingPlayer.isSpy) {
      // Indeed the spy -> Go to guessing
      setSpyGameState({
        ...spyGameState,
        status: 'guessing',
        accusedPlayerId: claimingPlayerId
      });
    } else {
      // Not the spy -> Group wins!
      setSpyGameState({
        ...spyGameState,
        status: 'game_over',
        winner: { id: 'group', name: 'الأغلبية (الجروب)' },
        reason: `اللعيب (${claimingPlayer.name}) افتكر نفسه المتغفل وهو بريء! الأغلبية كسبت الجيم.`
      });
      playSound('gameover');
    }
  };

  const resetSpyLocalGame = () => {
    playSound('click');
    setSpyGameState(null);
    setMode('select');
  };

  // --- SPY ONLINE GAME ACTION EMITS ---
  const startOnlineSpySetup = async () => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    if (roomState.players.length < 3) {
      alert('لازم يكون فيه 3 لعيبة على الأقل عشان تلعبوا.');
      return;
    }

    const pair = allSpyLocations[Math.floor(Math.random() * allSpyLocations.length)];
    const isAForMajority = Math.random() > 0.5;
    const majorityLocation = isAForMajority ? pair.location_A : pair.location_B;
    const minorityLocation = isAForMajority ? pair.location_B : pair.location_A;

    const spyIdx = Math.floor(Math.random() * roomState.players.length);
    const spyId = roomState.players[spyIdx].playerId;

    const options = new Set();
    options.add(majorityLocation);
    while (options.size < 10 && options.size < allSpyLocations.length * 2) {
      const randomLoc = allSpyLocations[Math.floor(Math.random() * allSpyLocations.length)];
      const randomName = Math.random() > 0.5 ? randomLoc.location_A : randomLoc.location_B;
      if (randomName !== majorityLocation) {
        options.add(randomName);
      }
    }
    const shuffledOptions = shuffle(Array.from(options));

    const updatedPlayers = roomState.players.map((p) => {
      const isSpy = p.playerId === spyId;
      const locationVal = isSpy ? minorityLocation : majorityLocation;
      const rolePayload = { isSpy, location: locationVal };
      const encryptionKey = p.tempKey || p.playerId;
      const encryptedRole = encryptRole(rolePayload, encryptionKey);

      const newPlayer = {
        ...p,
        encryptedRole,
        isReady: false
      };
      delete newPlayer.tempKey;
      return newPlayer;
    });

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await updateDoc(roomRef, {
        status: 'reveal',
        gameType: 'el-motagafel',
        players: updatedPlayers,
        spyPlayerId: spyId,
        spyGuessOptions: shuffledOptions,
        spyGuess: null,
        gameStartedAt: null,
        accusedPlayerId: null,
        votes: {},
        votingStatus: 'none',
        winner: null
      });
      console.log("Online spy game setup completed.");
    } catch (err) {
      console.error("Error setting up online spy game:", err);
    }
  };

  const submitOnlineSpyReady = async () => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        const updatedPlayers = room.players.map(p => {
          if (p.playerId === myPlayerId) {
            return { ...p, isReady: true };
          }
          return p;
        });

        const allReady = updatedPlayers.every(p => p.isReady);
        const updates = { players: updatedPlayers };

        if (allReady) {
          updates.status = 'playing';
          updates.gameStartedAt = Date.now();
        }

        transaction.update(roomRef, updates);
      });
    } catch (err) {
      console.error("Error setting player ready in online spy game:", err);
    }
  };

  const startOnlineSpyVoting = async (accusedId) => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await updateDoc(roomRef, {
        accusedPlayerId: accusedId,
        votingStatus: 'voting',
        votes: {}
      });
    } catch (err) {
      console.error("Error starting online voting:", err);
    }
  };

  const submitOnlineSpyVote = async (voteValue) => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) return;

        const room = sfDoc.data();
        const votes = room.votes || {};
        votes[myPlayerId] = voteValue;

        const voters = room.players.filter(p => p.playerId !== room.accusedPlayerId);
        const allVoted = voters.every(p => votes[p.playerId] !== undefined);

        const updates = { votes };

        if (allVoted) {
          const yesVotes = voters.filter(p => votes[p.playerId] === true).length;
          const noVotes = voters.filter(p => votes[p.playerId] === false).length;
          
          if (yesVotes > noVotes) {
            const accusedPlayer = room.players.find(p => p.playerId === room.accusedPlayerId);
            const isSpy = room.spyPlayerId === room.accusedPlayerId;

            if (isSpy) {
              updates.status = 'guessing';
              updates.votingStatus = 'none';
            } else {
              const spyPlayer = room.players.find(p => p.playerId === room.spyPlayerId);
              updates.status = 'game_over';
              updates.votingStatus = 'none';
              updates.winner = spyPlayer ? { id: spyPlayer.playerId, name: spyPlayer.name } : { id: 'spy', name: 'المتغفل' };
              updates.reason = `اتهمتوا اللعيب البريء (${accusedPlayer ? accusedPlayer.name : 'بريء'})! المتغفل طلع كسبان.`;
            }
          } else {
            updates.votingStatus = 'none';
            updates.accusedPlayerId = null;
            updates.votes = {};
          }
        }

        transaction.update(roomRef, updates);
      });
    } catch (err) {
      console.error("Error submitting online vote:", err);
    }
  };

  const submitOnlineSpyGuess = async (guessedLocation) => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      await updateDoc(roomRef, {
        spyGuess: guessedLocation
      });
    } catch (err) {
      console.error("Error submitting online spy guess:", err);
    }
  };

  const handleOnlineSpySelfReveal = async (claimingPlayerId) => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const isSpy = roomState.spyPlayerId === claimingPlayerId;
    const claimingPlayer = roomState.players.find(p => p.playerId === claimingPlayerId);
    const roomRef = doc(db, 'rooms', onlineRoomCode);

    try {
      if (isSpy) {
        await updateDoc(roomRef, {
          status: 'guessing',
          accusedPlayerId: claimingPlayerId,
          votingStatus: 'none'
        });
      } else {
        const spyPlayer = roomState.players.find(p => p.playerId === roomState.spyPlayerId);
        await updateDoc(roomRef, {
          status: 'game_over',
          winner: { id: 'group', name: 'الأغلبية (الجروب)' },
          reason: `اللعيب (${claimingPlayer ? claimingPlayer.name : 'بريء'}) افتكر نفسه المتغفل وهو بريء! الأغلبية كسبت الجيم.`,
          votingStatus: 'none'
        });
      }
    } catch (err) {
      console.error("Error handling online self reveal:", err);
    }
  };

  const restartOnlineSpyGame = async () => {
    playSound('click');
    if (!onlineRoomCode || !roomState) return;

    const roomRef = doc(db, 'rooms', onlineRoomCode);
    try {
      const updatedPlayers = roomState.players.map(p => {
        return {
          ...p,
          tempKey: p.playerId === myPlayerId ? myTempKey : p.playerId,
          isReady: false,
          encryptedRole: null
        };
      });

      await updateDoc(roomRef, {
        status: 'lobby',
        players: updatedPlayers,
        spyPlayerId: null,
        spyGuessOptions: null,
        spyGuess: null,
        gameStartedAt: null,
        accusedPlayerId: null,
        votes: null,
        votingStatus: null,
        winner: null
      });
    } catch (err) {
      console.error("Error restarting online spy game:", err);
    }
  };

  // --- ONLINE GAME ACTION EMITS ---

  const createOnlineRoom = async () => {
    if (!onlineName.trim()) {
      alert('اكتب اسمك الأول معلش.');
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
      gameType: activeGame || 'send-101',
      players: [
        {
          id: myPlayerId,
          playerId: myPlayerId,
          tempKey: myTempKey,
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
      alert("حصلت مشكلة وإحنا بنعمل الأوضة. جرب تاني كده معلش.");
    }
  };

  const joinOnlineRoom = async () => {
    if (!onlineName.trim() || !roomCodeInput.trim()) {
      alert('اكتب اسمك وكود الأوضة عشان تدخل.');
      return;
    }
    playSound('click');
    const rCode = roomCodeInput.trim().toUpperCase();
    const roomRef = doc(db, 'rooms', rCode);

    try {
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(roomRef);
        if (!sfDoc.exists()) {
          throw new Error('الأوضة دي مش موجودة، اتأكد من الكود كويس.');
        }

        const room = sfDoc.data();
        if (room.status !== 'lobby') {
          throw new Error('الجيم بدأ خلاص في الأوضة دي.');
        }

        if (room.players.length >= 10) {
          throw new Error('الأوضة مليانة على الآخر (آخرها 10 لعيبة).');
        }

        // Add player if they aren't already in
        const exists = room.players.some(p => p.playerId === myPlayerId);
        if (!exists) {
          room.players.push({
            id: myPlayerId,
            playerId: myPlayerId,
            tempKey: myTempKey,
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
      alert(err.message || "حصلت مشكلة وإنت بتدخل الأوضة. جرب تاني كده.");
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
      alert('لازم تكتب الـ 10 أسامي كلهم الأول.');
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
          <span className="logo-text">
            {activeGame === 'send-101' ? 'SEND-101' : activeGame === 'el-motagafel' ? 'المتغفل' : '101-GAMES'}
          </span>
        </div>
        <div className="subtitle">
          {activeGame === 'send-101' 
            ? 'تافه زي هاها شرير زي هيهي' 
            : activeGame === 'el-motagafel' 
              ? 'الكل هيلعب بقلب ميت! 🕵️' 
              : 'ألعاب قعدات ولمات الصحاب والضحك 🎮'}
        </div>
      </header>

      {errorMessage && (
        <div className="glass-panel" style={{ borderColor: 'var(--danger)', color: '#f87171', textAlign: 'center' }}>
          {errorMessage}
        </div>
      )}

      {/* Restore Session Banner */}
      {mode === 'select' && localStorage.getItem('send_room_code') && (
        <div className="glass-panel restore-banner">
          <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}>🔄 فيه جيم مكملش</span>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.4' }}>
            لقينا جيم قديم مكملش في أوضة **{localStorage.getItem('send_room_code')}** باسم **{localStorage.getItem('send_player_name')}**. تحب ترجع تكمله؟
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" style={{ flex: 2, fontSize: '0.95rem', padding: '0.65rem 1rem' }} onClick={handleRestoreSession}>
              أيوه، رجعني الأوضة 👍
            </button>
            <button className="btn btn-outline" style={{ flex: 1, fontSize: '0.95rem', padding: '0.65rem 1rem' }} onClick={handleDiscardSession}>
              فكك منه ❌
            </button>
          </div>
        </div>
      )}

      {/* 0. GAME HUB: Select Game */}
      {activeGame === null && (
        <div className="glass-panel hub-panel">
          <h2 style={{ textAlign: 'center', marginBottom: '1.75rem', fontWeight: 800 }}>بوابة الألعاب 🎮</h2>
          
          <div className="hub-grid">
            {/* Game 1: SEND-101 */}
            <div className="hub-game-card active-game" onClick={() => {
              playSound('click');
              setActiveGame('send-101');
              setMode('select');
            }}>
              <div className="hub-game-icon-container">
                <span className="hub-game-icon">✈️</span>
              </div>
              <div className="hub-game-details">
                <h3 className="hub-game-title">SEND-101</h3>
                <span className="hub-game-badge active">ادخل العب 🚀</span>
              </div>
            </div>

            {/* Game 2: El-Motagafel */}
            <div className="hub-game-card active-game" onClick={() => {
              playSound('click');
              setActiveGame('el-motagafel');
              setMode('select');
            }}>
              <div className="hub-game-icon-container">
                <span className="hub-game-icon">🕵️</span>
              </div>
              <div className="hub-game-details">
                <h3 className="hub-game-title">المتغفل</h3>
                <span className="hub-game-badge active">ادخل العب 🚀</span>
              </div>
            </div>

            {/* Locked Game 3: Mafia */}
            <div className="hub-game-card locked-game">
              <div className="hub-game-icon-container">
                <span className="hub-game-icon">🤫</span>
              </div>
              <div className="hub-game-details">
                <h3 className="hub-game-title">المافيا الغامضة</h3>
                <span className="hub-game-badge locked">جاي في السكة 🔒</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. WELCOME SCREEN: Select Mode (Inside SEND-101) */}
      {activeGame === 'send-101' && mode === 'select' && (
        <div className="glass-panel">
          <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', fontWeight: 800 }}>اختار هتلعب إزاي?</h2>
          
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
            <div className="mode-title">لعب أونلاين (كل واحد بموبايله)</div>
            <div className="mode-desc">
          اعمل أوضة مع أصحابك. كل لعيب هيدخل من موبايله بكود الأوضة، ونفذوا الأحكام مع بعض لايف!
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { playSound('click'); setActiveGame(null); }}>
              ↩️ ارجع
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { playSound('click'); setShowHowToPlay(true); }}>
              إزاي تلعب؟ 📖
            </button>
          </div>
        </div>
      )}

      {/* 1. WELCOME SCREEN: Select Mode (Inside El-Motagafel) */}
      {activeGame === 'el-motagafel' && mode === 'select' && (
        <div className="glass-panel">
          <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', fontWeight: 800 }}>المتغفل 🕵️</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
            لعبة التناقض التدريجي.. مين المتغفل اللي بيدافع عن مكانه وهو أصلاً مش فيه؟
          </p>
          
          <div className="mode-card active" onClick={() => {
            playSound('click');
            setMode('local');
            setLocalPlayers(['لاعب 1', 'لاعب 2', 'لاعب 3']);
          }}>
            <div className="mode-icon">📱</div>
            <div className="mode-title">لعب محلي (موبايل واحد)</div>
            <div className="mode-desc">
              تليفون واحد بيلف على كل اللاعيبة في القعدة. كل واحد بيشوف مكانه السري سرًا، وبعدين تبدأوا نقاش وتصويت.
            </div>
          </div>

          <div className="mode-card" onClick={() => {
            playSound('click');
            setMode('online');
          }}>
            <div className="mode-icon">🌐</div>
            <div className="mode-title">لعب أونلاين (كل واحد بموبايله)</div>
            <div className="mode-desc">
              اعمل أوضة مع أصحابك أو ادخل أوضة معمولة. كل واحد هيشوف مكانه على موبايله، والتصويت والتايمر شغالين مع بعض لايف!
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { playSound('click'); setActiveGame(null); }}>
              ↩️ ارجع
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { playSound('click'); setShowHowToPlaySpy(true); }}>
              إزاي تلعب؟ 📖
            </button>
          </div>
        </div>
      )}

      {/* 2. LOCAL GAME SCREENS */}
      {mode === 'local' && activeGame === 'send-101' && (
        <>
          {/* A. Local Lobby (Add/Remove Players) */}
          {!localGameState && (
            <div className="glass-panel">
              <h2 style={{ marginBottom: '1.25rem', fontWeight: 800 }}>جهز لستة الأسامي</h2>
              
              <div className="form-group">
                <label>ضيف لاعيبة (من 3 لـ 10 لاعيبة):</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="text-input"
                    style={{ flex: 1 }}
                    placeholder="اسم اللعيب"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addLocalPlayer()}
                  />
                  <button className="btn btn-primary" onClick={addLocalPlayer}>ضيف</button>
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
                  يلا نجهز أسامينا
                </button>
              </div>
            </div>
          )}

          {/* B. Local Name Entry (Privacy Shields) */}
          {localGameState && localGameState.status === 'name_entry' && (
            <div className="glass-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ fontWeight: 800 }}>تجهيز الأسامي</h2>
                <div className="turn-badge">دور: {localGameState.players[currentEnteringPlayerIdx].name}</div>
              </div>
              
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                اكتب 10 أسامي حقيقية من جهات الاتصال (Contacts) عندك تطابق التصنيفات دي بالترتيب. استخدم درع الخصوصية عشان تخفي كتابتك.
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
                      placeholder="اكتب الاسم الحقيقي هنا"
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
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => {
                    playSound('click');
                    if (currentEnteringPlayerIdx > 0) {
                      setCurrentEnteringPlayerIdx(currentEnteringPlayerIdx - 1);
                      setLocalContactsInput(localGameState.players[currentEnteringPlayerIdx - 1].contacts);
                    } else {
                      setLocalGameState(null);
                    }
                  }}
                >
                  رجوع
                </button>
                <button className="btn btn-secondary" style={{ flex: 2 }} onClick={submitLocalNames}>
                  {currentEnteringPlayerIdx < localGameState.players.length - 1 
                    ? 'حفظ وتمرير الموبايل للعيب اللي بعده'
                    : 'يلا نلعب! 🎮'}
                </button>
              </div>
            </div>
          )}

          {/* C. Local Play Screen */}
          {localGameState && localGameState.status === 'playing' && (
            <>
              {/* Turn Header */}
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <div className="game-top-bar">
                  <div className="turn-badge">الدور على: {localGameState.players[localGameState.turnIndex].name}</div>
                  <div className="score-badge">السكور: {localGameState.players[localGameState.turnIndex].score} / 250</div>
                </div>
              </div>

              {/* Step 1: Draw Card */}
              {localGameState.currentTurn.stage === 'draw' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  <h3 style={{ marginBottom: '1rem' }}>دوس على الكارت عشان تسحب الضحية</h3>
                  
                  <div className="card-scene" onClick={localDrawNumberCard}>
                    <div className="flip-card">
                      <div className="card-face card-back">
                        <div className="card-back-pattern">SEND-101</div>
                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '1rem' }}>دوس عشان تسحب</span>
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
                        <div className="card-back-pattern">SEND-101</div>
                      </div>
                      <div className="card-front card-face">
                        <div className="card-front-label">رقم كارت الضحية</div>
                        {localGameState.currentTurn.numberCard === 'Nobody' ? (
                          <div className="card-front-nobody">Nobody</div>
                        ) : (
                          <div className="card-front-number">{localGameState.currentTurn.numberCard}</div>
                        )}
                        <div className="card-front-label">
                          {localGameState.currentTurn.numberCard === 'Nobody' ? 'مفيش ضحية من عندك!' : 'الضحية من لستتك'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {localGameState.currentTurn.stage === 'wait_victim' && (
                    <div className="target-reveal">
                      <p style={{ color: 'var(--text-secondary)' }}>
                        بما أنه طلع كارت **Nobody**، اللعيب اللي على شمالك ({
                          localGameState.players[(localGameState.turnIndex + 1) % localGameState.players.length].name
                        }) هيختارلك ضحية من لستته هو!
                      </p>
                      <div className="form-group" style={{ marginTop: '1rem' }}>
                        <input
                          type="text"
                          className="text-input"
                          placeholder="اكتب اسم الضحية من لستتك"
                          value={selectedNobodyVictimName}
                          onChange={(e) => setSelectedNobodyVictimName(e.target.value)}
                        />
                      </div>
                      <button className="btn btn-secondary" style={{ width: '100%' }} onClick={submitLocalNobodyVictim}>
                        أكد الضحية
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
                       <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>الحكم اللي عليك تنفذه</h3>
                      <div className="dare-card" style={{ cursor: 'default', margin: '1rem 0' }}>
                        <span className={`dare-card-type ${localGameState.currentTurn.chosenCard.type.includes('فويس') ? 'voice' : localGameState.currentTurn.chosenCard.type.includes('مسدج') || localGameState.currentTurn.chosenCard.type.includes('رسالة') ? 'message' : 'call'}`}>
                          {localGameState.currentTurn.chosenCard.type}
                        </span>
                        <div className="dare-card-text" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                          {localGameState.currentTurn.chosenCard.text}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--warning)', marginTop: '0.5rem' }}>
                          الضحية اللي هتكلمها: <strong style={{ textDecoration: 'underline' }}>{localGameState.currentTurn.victimName}</strong>
                        </div>
                      </div>

                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                        لازم تبعت الحكم للضحية بجدية تامة. وممنوع تمسح الرسالة أو تلغي الاتصال طول ما الجيم شغال!
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <button className="btn btn-success" onClick={localExecuteSuccess}>
                          نفذت الحكم بجدية (+50 نقطة)
                        </button>
                        <button className="btn btn-danger" onClick={localChickenOut}>
                          هخلع (هروب طوارئ)
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
                <div className="scoreboard-title">لوحة النقط (الهدف: 250 نقطة)</div>
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
                  إنهاء الجيم والرجوع للرئيسية
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
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>الفايز بالجيم هو البطل 👑</div>
                <div className="winner-name">{localGameState.winner.name}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  النقط: {localGameState.winner.score} نقطة
                </div>
              </div>

              <h3 style={{ margin: '1.5rem 0 1rem 0', fontWeight: 800, color: 'var(--danger)' }}>عقابات اللعيبة الخسرانين ("هخلع") 💀</h3>
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
                نلعب تاني 🔄
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
              <h2 style={{ marginBottom: '1.5rem', fontWeight: 800 }}>اعمل أو ادخل أوضة أونلاين</h2>
              
              <div className="form-group">
                <label>اسم الشهرة بتاعك:</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="مثال: حمو"
                  value={onlineName}
                  onChange={(e) => setOnlineName(e.target.value)}
                />
              </div>

              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '1.5rem 0' }}></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={createOnlineRoom}>
                  اعمل أوضة جديدة ➕
                </button>
              </div>

              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '1.5rem 0' }}></div>

              <div className="form-group">
                <label>اكتب كود الأوضة (4 حروف):</label>
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
                  <button className="btn btn-outline" onClick={joinOnlineRoom}>خش الأوضة 🚪</button>
                </div>
              </div>

              <button className="btn btn-outline" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => setMode('select')}>
                ارجع للرئيسية
              </button>
            </div>
          )}

          {/* Active online screens for send-101 */}
          {roomState && activeGame === 'send-101' && (
            <>
              {/* B. Lobby Screen (Waiting for players) */}
              {roomState && roomState.status === 'lobby' && (
                <div className="glass-panel">
                  <h2 style={{ marginBottom: '1.25rem', fontWeight: 800 }}>أوضة الانتظار</h2>
                  
                  <div className="room-code-display">
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>كود الأوضة (دوس للنسخ):</span>
                    <span className="room-code" onClick={copyRoomCode} style={{ cursor: 'pointer' }}>
                      {roomState.code}
                    </span>
                    {copiedCode && <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>تم النسخ!</span>}
                  </div>

                  <h3 style={{ marginBottom: '0.75rem', fontWeight: 700 }}>اللاعيبة اللي دخلوا ({playersList.length}):</h3>
                  <div className="lobby-players-list">
                    {playersList.map(p => (
                      <div key={p.playerId} className="lobby-player-row" style={{ opacity: p.isDisconnected ? 0.5 : 1 }}>
                        <span className="lobby-player-name">
                          👤 {p.name} {p.isHost && <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>(صاحب الأوضة)</span>}
                        </span>
                        {p.isDisconnected ? (
                          <span className="waiting-badge" style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>خلع / منقطع ⏳</span>
                        ) : (
                          <span className="waiting-badge">مستنيين</span>
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
                      ابدأ تجهيز الأسامي (3+ لاعيبة)
                    </button>
                  ) : (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '1.5rem' }}>
                      مستنيين صاحب الأوضة يبدأ اللعب...
                    </p>
                  )}

                  <button className="btn btn-outline" style={{ width: '100%', marginTop: '1rem' }} onClick={leaveOnlineRoom}>
                    اخرج من الأوضة
                  </button>
                </div>
              )}

              {/* C. Online Name Entry Screen */}
              {roomState && roomState.status === 'name_entry' && (
                <div className="glass-panel">
                  <h2 style={{ marginBottom: '0.5rem', fontWeight: 800 }}>جهز أساميك الـ 10</h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                    اكتب الـ 10 أسامي الحقيقية المقابلة للتصنيفات بالترتيب. مفيش أي لعيب تاني هيشوف الأسامي اللي بتدخلها.
                  </p>

                  {playersList.find(p => p.playerId === myPlayerId)?.isReady ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                      <h3>حفظنا أساميك بنجاح! 👍</h3>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        مستنيين باقي اللعيبة يخلصوا كتابة أساميهم...
                      </p>
                      <div style={{ marginTop: '1.5rem' }}>
                        {playersList.map(p => (
                          <div key={p.playerId} className="lobby-player-row" style={{ marginBottom: '0.5rem', opacity: p.isDisconnected ? 0.5 : 1 }}>
                            <span>
                              {p.name} {p.isDisconnected && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>(فصل 🔌)</span>}
                            </span>
                            {p.isDisconnected ? (
                              <span className="waiting-badge" style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>فصل ⏳</span>
                            ) : p.isReady ? (
                              <span className="ready-badge">جاهز</span>
                            ) : (
                              <span className="waiting-badge">بيكتب دلوقتي...✍️</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <button className="btn btn-outline" style={{ width: '100%', marginTop: '1.5rem' }} onClick={leaveOnlineRoom}>
                        اخرج من الأوضة
                      </button>
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
                              placeholder="اكتب اسمه الحقيقي هنا"
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
                        احفظ أسامي الجيم 🎮
                      </button>
                      <button className="btn btn-outline" style={{ width: '100%', marginTop: '0.75rem' }} onClick={leaveOnlineRoom}>
                        اخرج من الأوضة
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* D. Online Active Game Screen */}
              {roomState && roomState.status === 'playing' && (
                <>
                  {/* Turn Header */}
                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <div className="game-top-bar">
                      <div className="turn-badge">
                        الدور على: {playersList[roomState.turnIndex]?.name}
                        {playersList[roomState.turnIndex]?.playerId === myPlayerId && ' (أنت)'}
                      </div>
                      <div className="score-badge">سكورك: {playersList.find(p => p.playerId === myPlayerId)?.score || 0} / 250</div>
                    </div>
                  </div>

                  {/* Stage: Draw */}
                  {roomState.currentTurn.stage === 'draw' && (
                    <div className="glass-panel" style={{ textAlign: 'center' }}>
                      {playersList[roomState.turnIndex]?.playerId === myPlayerId ? (
                        <>
                          <h3 style={{ marginBottom: '1rem' }}>دوس على الكارت عشان تسحب الضحية</h3>
                          <div className="card-scene" onClick={drawOnlineNumberCard}>
                            <div className="flip-card">
                              <div className="card-face card-back">
                                <div className="card-back-pattern">SEND-101</div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ padding: '2rem 0' }}>
                          <div className="waiting-spinner" style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                          <h3>مستنيين اللعيب {playersList[roomState.turnIndex]?.name} يسحب كارت...</h3>
                          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                            الحكم اللي هيتسحب هيتنفذ لايف قدامكم!
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stage: Wait Victim (Nobody Card) */}
                  {roomState.currentTurn.stage === 'wait_victim' && (
                    <div className="glass-panel" style={{ textAlign: 'center' }}>
                      {roomState.currentTurn.leftPlayerId === myPlayerId ? (
                        <div>
                          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😈</div>
                          <h3 style={{ marginBottom: '0.75rem', fontWeight: 800 }}>كارت الـ Nobody!</h3>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                            اللعيب {playersList[roomState.turnIndex]?.name} سحب كارت "Nobody". 
                            أنت اللي على شماله، اختارله ضحية من لستة أساميك تلبسه فيها!
                          </p>

                          <div className="form-group" style={{ textAlign: 'right' }}>
                            <label>اختار ضحية يتبعتلها الحكم:</label>
                            <select
                              className="text-input"
                              style={{ width: '100%', background: '#1e1b4b', color: 'white' }}
                              value={onlineNobodyVictim}
                              onChange={(e) => setOnlineNobodyVictim(e.target.value)}
                            >
                              <option value="">-- اختار ضحية من أساميك --</option>
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
                            ابعت الضحية اللي اخترتها
                          </button>
                        </div>
                      ) : (
                        <div className="target-reveal">
                          <p style={{ color: 'var(--text-secondary)' }}>
                            مستنيين اللعيب {playersList.find(p => p.playerId === roomState.currentTurn.leftPlayerId)?.name} يختار الضحية من لستته...
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
                            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>الحكم اللي عليك تنفذه</h3>
                            
                            <div className="dare-card" style={{ cursor: 'default', margin: '1rem 0' }}>
                              <span className={`dare-card-type ${roomState.currentTurn.chosenCard.type.includes('فويس') ? 'voice' : roomState.currentTurn.chosenCard.type.includes('مسدج') || roomState.currentTurn.chosenCard.type.includes('رسالة') ? 'message' : 'call'}`}>
                                {roomState.currentTurn.chosenCard.type}
                              </span>
                              <div className="dare-card-text" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                {roomState.currentTurn.chosenCard.text}
                              </div>
                              <div style={{ fontSize: '0.9rem', color: 'var(--warning)', marginTop: '0.5rem' }}>
                                الضحية اللي هتكلمها: <strong>{roomState.currentTurn.victimName}</strong>
                              </div>
                            </div>

                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                              لازم تبعت الحكم للضحية بجدية تامة. وممنوع تمسح الرسالة أو تلغي الاتصال طول ما الجيم شغال!
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              <button className="btn btn-success" onClick={executeOnlineSuccess}>
                                نفذت الحكم بجدية (+50 نقطة) ✅
                              </button>
                              <button className="btn btn-danger" onClick={chickenOnlineOut}>
                                هخلع (انسحاب طوارئ 🚨)
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="emergency-card-container" style={{ padding: '1.25rem', borderRadius: '20px' }}>
                            <div className="emergency-header">🚨 كارت الطوارئ: هخلع</div>
                            <p style={{ fontSize: '1.1rem', margin: '1rem 0', lineHeight: '1.5', fontWeight: 600 }}>
                              {roomState.currentTurn.emergencyCard.text}
                            </p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
                              <button className="btn btn-secondary" onClick={executeOnlineEmergency}>
                                نفذت كارت هخلع (+20 نقطة) 🚨
                              </button>
                            </div>
                          </div>
                        )
                      ) : (
                        // Other players waiting during execution
                        <div style={{ padding: '1rem 0' }}>
                          <h3 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>الحكم بيتنفذ دلوقتي...</h3>
                          <p>
                            اللعيب {playersList[roomState.turnIndex]?.name} عليه الحكم ده عشان يكلم {roomState.currentTurn.victimName}:
                          </p>
                          <div className="dare-card" style={{ cursor: 'default', margin: '1rem 0', opacity: 0.85 }}>
                            <span className={`dare-card-type ${roomState.currentTurn.chosenCard.type.includes('فويس') ? 'voice' : roomState.currentTurn.chosenCard.type.includes('مسدج') || roomState.currentTurn.chosenCard.type.includes('رسالة') ? 'message' : 'call'}`}>
                              {roomState.currentTurn.chosenCard.type}
                            </span>
                            <div className="dare-card-text">{roomState.currentTurn.chosenCard.text}</div>
                          </div>
                          
                          {roomState.currentTurn.emergencyCard && (
                            <div className="emergency-card-container" style={{ padding: '0.8rem', borderRadius: '14px', marginTop: '1rem' }}>
                              <div style={{ fontWeight: 'bold', color: '#ff8a8d' }}>🚨 خلع ولجأ لكارت الطوارئ:</div>
                              <div style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>{roomState.currentTurn.emergencyCard.text}</div>
                            </div>
                          )}

                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
                            مستنيين اللعيب يأكد إنه نفذ...
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Online Scoreboard Overlay */}
                  <div className="glass-panel scoreboard">
                    <div className="scoreboard-title">جدول النقط (الهدف: 250 نقطة)</div>
                    {playersList.map(p => (
                      <div key={p.playerId} className="score-row" style={{ opacity: p.isDisconnected ? 0.5 : 1 }}>
                        <div className="score-row-meta">
                          <span>
                            {p.name} {p.playerId === playersList[roomState.turnIndex]?.playerId && '👈'}
                            {p.isDisconnected && <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginRight: '0.5rem' }}>(فصل 🔌)</span>}
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
                      اخرج من الأوضة
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
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>الفايز بالجيم هو البطل 👑</div>
                    <div className="winner-name">{roomState.winner.name}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                      النقط: {roomState.winner.score} نقطة
                    </div>
                  </div>

                  <h3 style={{ margin: '1.5rem 0 1rem 0', fontWeight: 800, color: 'var(--danger)' }}>عقابات اللعيبة الخسرانين ("هخلع") 💀</h3>
                  <div className="punishment-box">
                    {playersList.map(p => {
                      if (p.playerId === roomState.winner.playerId) return null;
                      
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
                      نلعب تاني 🔄
                    </button>
                  ) : (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>
                      مستنيين صاحب الأوضة يبدأ جيم جديد...
                    </p>
                  )}

                  <button className="btn btn-outline" style={{ width: '100%', marginTop: '1rem' }} onClick={leaveOnlineRoom}>
                    ارجع لبوابة الألعاب
                  </button>
                </div>
              )}
            </>
          )}

          {/* Active online screens for el-motagafel */}
          {roomState && activeGame === 'el-motagafel' && (
            <>
              {/* Online Spy Lobby Screen */}
              {roomState.status === 'lobby' && (
                <div className="glass-panel">
                  <h2 style={{ marginBottom: '1.25rem', fontWeight: 800 }}>أوضة الانتظار - المتغفل 🕵️</h2>
                  
                  <div className="room-code-display">
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>كود الأوضة (دوس للنسخ):</span>
                    <span className="room-code" onClick={copyRoomCode} style={{ cursor: 'pointer' }}>
                      {roomState.code}
                    </span>
                    {copiedCode && <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>تم النسخ!</span>}
                  </div>

                  <h3 style={{ marginBottom: '0.75rem', fontWeight: 700 }}>اللاعيبة اللي دخلوا ({playersList.length}):</h3>
                  <div className="lobby-players-list">
                    {playersList.map(p => (
                      <div key={p.playerId} className="lobby-player-row" style={{ opacity: p.isDisconnected ? 0.5 : 1 }}>
                        <span className="lobby-player-name">
                          👤 {p.name} {p.isHost && <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>(صاحب الأوضة)</span>}
                        </span>
                        {p.isDisconnected ? (
                          <span className="waiting-badge" style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>خلع / منقطع ⏳</span>
                        ) : (
                          <span className="waiting-badge">مستنيين</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Host starts the game */}
                  {playersList.find(p => p.playerId === myPlayerId)?.isHost ? (
                    <button
                      className={`btn btn-secondary ${playersList.length < 3 ? 'btn-disabled' : ''}`}
                      style={{ width: '100%', marginTop: '2rem' }}
                      onClick={startOnlineSpySetup}
                      disabled={playersList.length < 3}
                    >
                      ابدأ الجيم 🎮 (3+ لاعيبة)
                    </button>
                  ) : (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '2rem' }}>
                      مستنيين صاحب الأوضة يبدأ اللعب...
                    </p>
                  )}

                  <button className="btn btn-outline" style={{ width: '100%', marginTop: '1rem' }} onClick={leaveOnlineRoom}>
                    اخرج من الأوضة
                  </button>
                </div>
              )}

              {/* Online Spy Reveal Screen */}
              {roomState.status === 'reveal' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  <h2 style={{ marginBottom: '1rem', fontWeight: 800 }}>الكشف السري 🕵️</h2>
                  
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    دوس على الكارت عشان تعرف مكانك السري من غير ما حد واقف جنبك يلمحه.
                  </p>

                  {!isLocationRevealed ? (
                    <button
                      className="btn btn-secondary"
                      style={{ width: '100%', padding: '1.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}
                      onClick={() => { playSound('flip'); setIsLocationRevealed(true); }}
                    >
                      اظهر مكاني السري 👁️
                    </button>
                  ) : (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                      <div className="card-face card-front" style={{ margin: '0 auto 2rem auto', height: 'auto', padding: '2rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '0.5rem' }}>المكان السري بتاعك هو:</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{myDecryptedRole?.location}</div>
                      </div>

                      {playersList.find(p => p.playerId === myPlayerId)?.isReady ? (
                        <div style={{
                          background: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.2)',
                          padding: '1rem',
                          borderRadius: '14px',
                          color: 'var(--success)',
                          marginBottom: '1.5rem'
                        }}>
                          جاهز! مستنيين باقي اللعيبة... 👍
                        </div>
                      ) : (
                        <button
                          className="btn btn-primary"
                          style={{ width: '100%', marginBottom: '1.5rem' }}
                          onClick={() => { submitOnlineSpyReady(); setIsLocationRevealed(false); }}
                        >
                          أنا جاهز 👍
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Online Spy Active Game Screen */}
              {roomState.status === 'playing' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  {roomState.votingStatus === 'voting' ? (
                    <div>
                      <div className="winner-crown" style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🚨</div>
                      <h2 style={{ fontWeight: 850, marginBottom: '1.25rem' }}>تصويت طوارئ!</h2>

                      <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        padding: '1.25rem',
                        borderRadius: '16px',
                        marginBottom: '1.5rem'
                      }}>
                        <span style={{ fontSize: '0.95rem' }}>اللعيب المتهم هو: </span>
                        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--danger)' }}>
                          {playersList.find(p => p.playerId === roomState.accusedPlayerId)?.name}
                        </span>
                      </div>

                      {roomState.accusedPlayerId === myPlayerId ? (
                        <div>
                          <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '1rem' }}>
                            أنت المتهم! الباقي بيصوت عليك دلوقتي... 🤫
                          </p>
                          <div className="lobby-players-list" style={{ marginTop: '1.5rem' }}>
                            {playersList.filter(p => p.playerId !== roomState.accusedPlayerId).map(p => (
                              <div key={p.playerId} className="lobby-player-row">
                                <span>{p.name}</span>
                                {roomState.votes?.[p.playerId] !== undefined ? (
                                  <span className="ready-badge">صوّت خلاص</span>
                                ) : (
                                  <span className="waiting-badge">بيفكر...</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          {roomState.votes?.[myPlayerId] !== undefined ? (
                            <div>
                              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                تم تسجيل صوتك بنجاح. مستنيين باقي اللعيبة... 👍
                              </p>
                              <div className="lobby-players-list">
                                {playersList.filter(p => p.playerId !== roomState.accusedPlayerId).map(p => (
                                  <div key={p.playerId} className="lobby-player-row">
                                    <span>{p.name}</span>
                                    {roomState.votes?.[p.playerId] !== undefined ? (
                                      <span className="ready-badge">صوّت خلاص</span>
                                    ) : (
                                      <span className="waiting-badge">بيفكر...</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                هل تظن إن اللعيب ده هو المتغفل؟
                              </p>
                              <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                  className="btn btn-secondary"
                                  style={{ flex: 1, padding: '1rem' }}
                                  onClick={() => submitOnlineSpyVote(true)}
                                >
                                  نعم، هو المتغفل ✅
                                </button>
                                <button
                                  className="btn btn-outline"
                                  style={{ flex: 1, padding: '1rem' }}
                                  onClick={() => submitOnlineSpyVote(false)}
                                >
                                  لا، بريء ❌
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h2 style={{ fontWeight: 800, marginBottom: '0.5rem' }}>وقت النقاش والأسئلة 🗣️</h2>
                      
                      <div style={{
                        fontSize: '3.5rem',
                        fontWeight: 900,
                        fontFamily: 'var(--font-english)',
                        color: spyTimer < 30 ? 'var(--danger)' : 'var(--primary)',
                        margin: '1rem 0 1.5rem 0',
                        textShadow: '0 0 15px rgba(234, 179, 8, 0.2)'
                      }}>
                        {Math.floor(spyTimer / 60)}:{String(spyTimer % 60).padStart(2, '0')}
                      </div>

                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                        اسألوا بعض أسئلة ذكية عشان تكشفوا مين المتغفل من غير ما توضحوا اسم مكانكم الصح.
                      </p>

                      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', margin: '1.5rem 0' }}></div>

                      <h3 style={{ marginBottom: '1rem', fontWeight: 700 }}>اتهم حد أو أعلن إنك المتغفل:</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {playersList.map(p => (
                          <div key={p.playerId} style={{ display: 'flex', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
                            <span style={{ flex: 1, textAlign: 'right', fontWeight: 'bold' }}>
                              👤 {p.name} {p.playerId === myPlayerId && <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(أنت)</span>}
                            </span>
                            
                            {p.playerId !== myPlayerId && (
                              <button
                                className="btn btn-outline"
                                style={{ flex: 1.5, fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                                onClick={() => startOnlineSpyVoting(p.playerId)}
                              >
                                اتهم اللعيب ده 🚨
                              </button>
                            )}

                            {p.playerId === myPlayerId && (
                              <button
                                className="btn btn-outline"
                                style={{ flex: 1.5, fontSize: '0.85rem', padding: '0.5rem 0.75rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--danger)' }}
                                onClick={() => handleOnlineSpySelfReveal(myPlayerId)}
                              >
                                أنا المتغفل 🕵️
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <button className="btn btn-outline" style={{ width: '100%', marginTop: '2rem' }} onClick={leaveOnlineRoom}>
                        اخرج من الأوضة 🚪
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Online Spy Guess Screen */}
              {roomState.status === 'guessing' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🕵️</div>
                  <h2 style={{ fontWeight: 850, marginBottom: '0.5rem' }}>تخمين مكان الأغلبية</h2>
                  
                  <div className="turn-badge" style={{ display: 'inline-block', marginBottom: '1.5rem' }}>
                    دور المتغفل: {playersList.find(p => p.playerId === roomState.accusedPlayerId)?.name}
                  </div>

                  {roomState.spyPlayerId === myPlayerId ? (
                    <div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                        أنت المتغفل! قدامك فرصة واحدة عشان تخمن مكان الأغلبية الصح من بين الـ 10 خيارات دول. لو خمنت صح هتكسب الجيم!
                      </p>

                      <div className="guess-options-grid" style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.75rem',
                        marginBottom: '2rem'
                      }}>
                        {(roomState.spyGuessOptions || []).map((opt, idx) => (
                          <button
                            key={idx}
                            className={`btn ${spyGuessOptionSelected === opt ? 'btn-secondary' : 'btn-outline'}`}
                            style={{ fontSize: '0.9rem', padding: '0.75rem 0.5rem' }}
                            onClick={() => { playSound('click'); setSpyGuessOptionSelected(opt); }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>

                      <button
                        className={`btn btn-primary ${!spyGuessOptionSelected ? 'btn-disabled' : ''}`}
                        style={{ width: '100%' }}
                        onClick={() => { submitOnlineSpyGuess(spyGuessOptionSelected); setSpyGuessOptionSelected(''); }}
                        disabled={!spyGuessOptionSelected}
                      >
                        أكد التخمين النهائي 🧐
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '2rem 0' }}>
                      <div className="waiting-spinner" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
                      <h3>المتغفل بيخمن مكان الأغلبية دلوقتي...</h3>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        ركزوا معاه وشوفوا هيجيبها صح ولا غلط!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Online Spy Game Over Screen */}
              {roomState.status === 'game_over' && (
                <div className="glass-panel" style={{ textAlign: 'center' }}>
                  <ConfettiEffect />
                  <div className="winner-box">
                    <div className="winner-crown">👑</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>الفايز بالجيم هو 👑</div>
                    <div className="winner-name">{roomState.winner?.name}</div>
                  </div>

                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-light)',
                    padding: '1.25rem',
                    borderRadius: '16px',
                    margin: '1.5rem 0',
                    lineHeight: '1.6',
                    textAlign: 'right'
                  }}>
                    <strong>السبب: </strong> {roomState.reason}
                  </div>

                  <h3 style={{ margin: '1.5rem 0 1rem 0', fontWeight: 800, color: 'var(--danger)' }}>عقابات اللعيبة الخسرانين 💀</h3>
                  <div className="punishment-box">
                    {playersList.map(p => {
                      const isWinnerGroup = roomState.winner?.id === 'group';
                      const isPlayerSpy = p.playerId === roomState.spyPlayerId;
                      
                      if (isWinnerGroup && !isPlayerSpy) return null;
                      if (!isWinnerGroup && isPlayerSpy) return null;

                      const seedVal = p.name.charCodeAt(0) + (p.name.charCodeAt(p.name.length - 1) || 0);
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
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: '2rem' }} onClick={restartOnlineSpyGame}>
                      نلعب تاني 🔄
                    </button>
                  ) : (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>
                      مستنيين صاحب الأوضة يبدأ جيم جديد...
                    </p>
                  )}

                  <button className="btn btn-outline" style={{ width: '100%', marginTop: '1rem' }} onClick={leaveOnlineRoom}>
                    ارجع لبوابة الألعاب 🏠
                  </button>
                </div>
              )}
            </>
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

      {/* How to Play Modal */}
      {showHowToPlay && (
        <div className="dev-modal-overlay" onClick={() => setShowHowToPlay(false)}>
          <div className="how-to-play-modal-content" onClick={(e) => e.stopPropagation()} style={{ direction: 'rtl' }}>
            <button className="dev-modal-close" onClick={() => setShowHowToPlay(false)}>×</button>
            <h3>إزاي تلعب SEND-101؟ ✈️</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: '1.4', textAlign: 'center' }}>
              اللعبة سهلة ومحتاجة جرأة وضحك! دي القواعد ببساطة:
            </p>
            <ul style={{ listStyleType: 'disc' }}>
              <li>
                <strong>1. جهز أساميك:</strong> كل لعيب بيكتب 10 أسامي حقيقية من أصحابه وقرايبه مقابلة لتصنيفات عشوائية (زي الكراش، الإكس، مديرك...). الأسامي دي سرية ومحدش غيرك هيشوفها.
              </li>
              <li>
                <strong>2. اسحب كارت:</strong> في دورك، هتسحب كارت الضحية عشان يظهرلك رقم عشوائي (من 1 لـ 10) والضحية المقابلة ليه من أساميك، ومعه حكم عشوائي.
              </li>
              <li>
                <strong>3. نفذ أو اخلع:</strong> قدامك خيارين:
                <ul style={{ listStyleType: 'circle', paddingRight: '1rem', marginTop: '0.25rem' }}>
                  <li><strong>نفذ الحكم:</strong> تنفذ الحكم بجدية مع الضحية وتأخد <strong>+50 نقطة</strong>.</li>
                  <li><strong>هخلع:</strong> لو الحكم محرج أوي، دوس "هخلع" عشان يجيلك كارت طوارئ عشوائي تنفذه وتأخد <strong>+20 نقطة</strong> بس.</li>
                </ul>
              </li>
              <li>
                <strong>4. كارت الـ Nobody:</strong> لو سحبت كارت وطلع "Nobody"، اللعيب اللي على شمالك هيختارلك ضحية من لستة أساميه هو يلبسك فيها!
              </li>
              <li>
                <strong>5. المكسب:</strong> أول لعيب يوصل لـ <strong>250 نقطة</strong> هو الفايز بطل الجيم 👑. والخسرانين بيتفرقع عليهم عقابات عشوائية!
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* How to Play Modal (Spy Game) */}
      {showHowToPlaySpy && (
        <div className="dev-modal-overlay" onClick={() => setShowHowToPlaySpy(false)}>
          <div className="how-to-play-modal-content" onClick={(e) => e.stopPropagation()} style={{ direction: 'rtl' }}>
            <button className="dev-modal-close" onClick={() => setShowHowToPlaySpy(false)}>×</button>
            <h3>إزاي تلعب المتغفل؟ 🕵️</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: '1.4', textAlign: 'center' }}>
              لعبة الذكاء والتناقض النفسي. دي القواعد بالمصري ومن غير فزلكة:
            </p>
            <ul style={{ listStyleType: 'disc' }}>
              <li>
                <strong>1. الأماكن متقاربة:</strong> اللعبة بتختار مكانين شبه بعض أوي (مثلاً: جيم شعبي في حارة ضد جيم 5 نجوم في كومباوند).
              </li>
              <li>
                <strong>2. كلنا في الهوا سوا:</strong> كل اللعيبة (الأغلبية) هيظهرلهم نفس المكان (أ)، ماعدا لعيب واحد عشوائي (المتغفل) هيظهرله المكان (ب).
              </li>
              <li>
                <strong>3. مين المتغفل؟:</strong> اللعبة مش هتقول مين المتغفل! يعني حتى المتغفل نفسه هيفتكر إنه مع الأغلبية وبيدافع عن مكانه بكل ثقة.
              </li>
              <li>
                <strong>4. وقت الكلام (3 دقائق):</strong> اقعدوا اسألوا بعض أسئلة ذكية عن المكان. مثلاً: "الناس بتلبس إيه وهي رايحة هناك؟" أو "بتدفع كام هناك؟". المتغفل هيبدأ يلاحظ تناقض تدريجي في كلامه مع الباقيين!
              </li>
              <li>
                <strong>5. قفش المتغفل:</strong> لو شاكين في حد، ابدأوا تصويت عليه:
                <ul style={{ listStyleType: 'circle', paddingRight: '1rem', marginTop: '0.25rem' }}>
                  <li>لو اتهمتوا حد بريء ⬅️ <strong>المتغفل يكسب فوراً!</strong></li>
                  <li>لو اتهمتوا المتغفل صح ⬅️ المتغفل بياخد فرصة أخيرة لتخمين مكان الأغلبية من 10 خيارات. لو جابها صح ⬅️ <strong>يكسب</strong>، لو غلط ⬅️ <strong>الأغلبية تكسب</strong>.</li>
                </ul>
              </li>
              <li>
                <strong>6. التفركش الذاتي:</strong> لو أنت حسيت إنك المتغفل في أي وقت من الجيم، تقدر تدوس "أنا المتغفل" وتخمن مكان الأغلبية وتكسب الجيم لو صح!
              </li>
            </ul>
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
