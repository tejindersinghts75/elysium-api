import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_URL
});

const db = getDatabase(app);

/* -----------------------------
AUTO MESSAGE DATA
------------------------------ */

const autoNames = [
  "Aarav", "Vivaan", "Aditya", "Arjun", "Reyansh", "Muhammad", "Sai", "Krishna", "Ishaan", "Shaurya",
  "Rohan", "Aryan", "Kunal", "Kabir", "Anaya", "Aanya", "Diya", "Ira", "Myra", "Sara",
  "Emma", "Olivia", "Ava", "Sophia", "Isabella", "Mia", "Charlotte", "Amelia", "Harper", "Evelyn",
  "Liam", "Noah", "Oliver", "Elijah", "William", "James", "Benjamin", "Lucas", "Henry", "Alexander",
  "Michael", "Daniel", "Matthew", "Joseph", "David", "Samuel", "Anthony", "Christopher", "Andrew", "Joshua",
  "Chris", "Ryan", "Nathan", "Dylan", "Logan", "Jackson", "Levi", "Sebastian", "Mateo", "Jack",
  "Owen", "Theodore", "Aiden", "Wyatt", "John", "Luke", "Jayden", "Julian", "Grayson", "Leo",
  "Isaac", "Gabriel", "Anthony", "Hudson", "Carter", "Ezra", "Thomas", "Charles", "Christopher", "Jaxon",
  "Maverick", "Josiah", "Isaiah", "Andrew", "Elias", "Joshua", "Nathaniel", "Caleb", "Ryan", "Adrian",
  "Miles", "Eli", "Nolan", "Christian", "Aaron", "Cameron", "Ezekiel", "Colton", "Luca", "Landon",

  "Anika", "Riya", "Priya", "Neha", "Kavya", "Pooja", "Simran", "Meera", "Aditi", "Sneha",
  "Nisha", "Tanya", "Ritu", "Ishita", "Shruti", "Pallavi", "Swati", "Komal", "Nikita", "Shreya",

  "Emily", "Abigail", "Ella", "Scarlett", "Grace", "Chloe", "Victoria", "Riley", "Aria", "Lily",
  "Aubrey", "Zoey", "Penelope", "Layla", "Lillian", "Nora", "Hazel", "Madison", "Ellie", "Stella",
  "Natalie", "Zoe", "Leah", "Hannah", "Luna", "Addison", "Aaliyah", "Brooklyn", "Savannah", "Claire",
  "Skylar", "Lucy", "Paisley", "Everly", "Anna", "Caroline", "Nova", "Genesis", "Emilia", "Kennedy",
  "Samantha", "Maya", "Willow", "Kinsley", "Naomi", "Ariana", "Elena", "Sarah", "Allison", "Gabriella",

  "Rahul", "Aman", "Vikas", "Deepak", "Suresh", "Mahesh", "Rakesh", "Rajesh", "Manish", "Sanjay",
  "Anil", "Sunil", "Vijay", "Ajay", "Nitin", "Pankaj", "Harsh", "Varun", "Yash", "Rajat",
  "Dev", "Armaan", "Rudra", "Lakshya", "Parth", "Dhruv", "Kartik", "Shivam", "Gaurav", "Abhishek",

  "Ethan", "Jacob", "Logan", "Lucas", "Mason", "Evan", "Connor", "Hunter", "Austin", "Robert",
  "Tyler", "Brandon", "Zachary", "Kevin", "Jason", "Justin", "Aaron", "Adam", "Brian", "Eric",

  "Fatima", "Ayesha", "Zara", "Noor", "Hina", "Sana", "Alina", "Iqra", "Mariam", "Nazia",
  "Bushra", "Samina", "Uzma", "Nida", "Rida", "Mahira", "Hafsa", "Laiba", "Sadia", "Kiran",

  "Ismail", "Hassan", "Ali", "Omar", "Usman", "Bilal", "Imran", "Faisal", "Tariq", "Salman",
  "Arif", "Zubair", "Yasir", "Asad", "Shahid", "Naveed", "Junaid", "Farhan", "Adil", "Sajid",

  "George", "Harry", "Jack", "Charlie", "Jacob", "Thomas", "Oscar", "William", "James", "Henry",
  "Freddie", "Alfie", "Archie", "Theo", "Leo", "Arthur", "Edward", "Joshua", "Max", "Noah",

  "Amelia", "Isla", "Ava", "Mia", "Grace", "Freya", "Lily", "Florence", "Rosie", "Sophie",
  "Ivy", "Evie", "Elsie", "Charlotte", "Willow", "Matilda", "Ruby", "Aria", "Harriet", "Bella",

  "Chen", "Li", "Wang", "Zhang", "Liu", "Yang", "Huang", "Zhao", "Wu", "Zhou",
  "Xu", "Sun", "Ma", "Zhu", "Hu", "Guo", "He", "Gao", "Lin", "Luo",

  "Yuki", "Hiroshi", "Takumi", "Sora", "Ren", "Haruto", "Yuta", "Daichi", "Kaito", "Riku",
  "Aiko", "Hana", "Yuna", "Sakura", "Mio", "Rin", "Akari", "Nanami", "Mei", "Emi",

  "Carlos", "Juan", "Luis", "Miguel", "Jose", "Andres", "Diego", "Jorge", "Ricardo", "Fernando",
  "Sofia", "Camila", "Valentina", "Isabella", "Lucia", "Martina", "Daniela", "Valeria", "Paula", "Elena"
];
let lastMessage = "";
/* ------------------------------------------------
   CATEGORIZED AUTO MESSAGES (REALISTIC CHAT FLOW)
------------------------------------------------ */

// Define message categories
const messageCategories = {
  greetings: [
    "hey", "hi", "hello", "hey yall", "hi everyone", "whats up", "sup", "yo", "hey hey", "hellooooo", "hiii", "hey from FL", "hi from Texas 🤠", "hello from NYC 🗽", "chi town here", "LA in the house 🔥", "denver here", "seattle says hi", "miami baby ☀️", "hey from ATL", "philly yo", "boston whats good", "detroit in the building", "portland here", "austin tx hiii", "san diego 🙌", "dallas hey", "houston whaddup", "orlando hey", "nashville here", "chicago land", "minnesota represent", "brooklyn in the chat", "queens nyc", "cali love 💯", "florida baby", "vegas here", "phoenix az", "from canada eh", "london uk here 🇬🇧", "berlin hello", "mexico city 🇲🇽", "toronto hiii", "sydney aus 🇦🇺", "melbourne hey"
  ],
  joinedAfterVideo: [
    "came from the ad", "saw the vid and clicked", "just saw the youtube ad", "ad got me", "who else came from tiktok", "tiktok brought me here", "saw this on ig", "instagram ad gang", "youtube algorithm sent me", "clicked so fast", "that ad was wild", "free teslas??? had to check", "tesla caught my eye ngl", "heard free teslas and ran here", "did he say free teslas", "free teslas?? 💀", "wait free cars??", "shared teslas is crazy", "tesla part got me", "not gonna lie the tesla thing hooked me", "i'm here for the teslas lol", "tesla or ban 😂", "where are the teslas", "i want my tesla", "tesla talk got my attention"
  ],
  firstImpressions: [
    "this looks interesting", "this is kinda cool", "wait this is actually dope", "this sounds too good", "is this for real", "this can't be real", "no way this is real", "is this a scam?", "feels too good to be true", "i'm skeptical but curious", "seems legit so far", "i like this idea", "lowkey interested", "highkey interested", "this is different", "never seen anything like this", "this is unique", "actually smart", "this could be huge", "lowkey genius", "this makes sense tbh", "why doesn't everywhere do this", "this is the future", "future of living fr", "this solves so much", "rent is insane this makes sense"
  ],
  pricing: [
    "how much is it", "pricing??", "whats the cost", "is it actually cheaper", "cheaper than rent??", "my rent is 2k pls help", "i pay 1800 for a shoebox", "nyc rent is killing me", "sf rent is a joke", "la rent is criminal", "this would save me so much", "say the price", "drop the price", "need pricing asap", "if this is under 1500 i'm in", "under 2k???", "no way it's cheaper", "how is it cheaper", "this sounds affordable", "finally something affordable", "i need this fr"
  ],
  foodDining: [
    "food included??", "dining plan you say", "free food??", "wait dining is included", "on site food is huge", "i hate cooking so this is perfect", "meal plan sounds nice", "what kind of food", "healthy options?", "vegan options?", "gluten free?", "i need good coffee", "breakfast included?", "late night food?", "dining hall vibes", "like college but better", "college dining was trash so hope this is better", "food better be good", "i'm a foodie so this matters", "cooking is overrated", "i live on doordash this would save me", "no more groceries??", "this alone saves me money"
  ],
  agriculture: [
    "on site farming??", "agriculture on site is cool", "wait they grow food there", "farming is interesting", "i know nothing about farming lol", "can i learn to farm", "volunteer farming sounds fun", "farm to table vibes", "this is so sustainable", "eco friendly", "love the farming idea", "i wanna grow my own veggies", "fresh produce always", "farm life but make it modern", "this is actually wholesome"
  ],
  teslas: [
    "shared tesla fleet is wild", "so i can just grab a tesla", "tesla whenever i want??", "no car payment is huge", "insurance included??", "gas savings tho", "ev charging included?", "this saves so much money", "i spend so much on gas", "tesla flex", "driving a tesla for free lol", "this is a dream", "car broke down so this is tempting", "i hate car maintenance"
  ],
  volunteering: [
    "volunteering on site?", "what volunteering", "entertainment options?", "what is there to do", "on site activities?", "game nights?", "movie nights?", "fitness classes?", "pool?", "gym?", "rooftop?", "fire pit vibes", "community events", "this sounds fun actually", "i'd volunteer for free rent lol", "volunteering is cool", "i like helping out", "keeps community tight"
  ],
  questions: [
    "where is it located", "what city", "is this in the US", "multiple locations?", "can i choose my room", "private room or shared?", "roommate situation?", "how many people", "whats the application process", "waiting list?", "how fast does it fill up", "can i tour it", "is it built yet", "when does it open", "move in date?", "lease length?", "month to month?", "deposit?", "utilities included?", "wifi included?", "parking?", "pet friendly?", "i have a cat is that ok", "dog friendly?", "couples allowed?", "families?", "age limit?", "is it only young ppl", "sounds like a college dorm", "is it 21+", "can i work remotely there", "is there coworking space", "privacy how does that work"
  ],
  excitedReady: [
    "i'm in", "sign me up", "take my money", "where do i apply", "shut up and take my money", "i need this", "this is exactly what i've been looking for", "been dreaming of something like this", "finally someone did it", "i'm moving", "packing my bags", "when can i move in", "i'm so ready", "this is my dream", "literally perfect", "this sounds amazing", "i'm so down", "count me in", "i'm sold", "where do i sign", "link to apply?"
  ],
  skeptical: [
    "seems too good", "what's the catch", "there's always a catch", "ok but hidden fees?", "sounds like a cult ngl", "cult vibes? 😂", "is this a cult", "hope it's not a cult", "this feels like a cult", "sounds like a commune", "commune vibes", "i've seen this before", "what's the downside", "who's running this", "is this a corporation", "what's the ownership structure", "i'm skeptical but watching"
  ],
  genzAbbreviations: [
    "fr tho", "ngl this looks good", "bruh", "bet", "say less", "i'm weak 😂", "deadass", "no cap", "fr fr", "on god", "periodt", "slay", "this ain't it?", "nah this is it", "let's gooo", "lesssgooo", "i'm crying", "💀💀💀", "😂😂", "😭😭", "🙏🙏", "🔥🔥🔥", "🚀🚀", "👀👀", "🤔🤔", "💯💯", "fr no cap", "for real for real", "u serious", "u kidding me", "pls tell me this is real", "pls pls pls", "omg", "omg fr", "wait fr", "no wayyy", "yoooo", "ayeee", "sheeesh", "sheesh 🥶", "let him cook", "he cooking fr", "this is gas", "this is straight gas", "i'm geeked", "i'm hype", "lowkey wanna join", "highkey need this"
  ],
  longerMessages: [
    "i've been looking for something exactly like this. rent is insane in my city and i hate living alone. community living sounds so much better.",
    "ok so let me get this straight. free teslas, food included, farming on site, and it's cheaper than rent? where has this been all my life",
    "i literally just paid 2400 for a one bedroom with no utilities. this would save me like 1000 a month easily. i'm so in.",
    "the shared tesla thing is what got me. i spend $400 a month on my car payment plus insurance plus gas. that alone is huge savings.",
    "i'm a remote worker so location doesn't matter. i'd move anywhere for this. community, food, cars included? that's a no brainer.",
    "i was skeptical at first but the more i hear the more it makes sense. we need more stuff like this. housing is broken.",
    "honestly the dining plan is the biggest flex for me. i spend so much on takeout because i hate cooking. this would fix my whole life.",
    "i've lived in co-living spaces before but nothing like this. the tesla + farming + dining combo is next level. who's running this?",
    "my biggest concern is privacy. like can i have my own space or is it all shared? i need alone time sometimes ya know",
    "i love the idea of volunteering on site. builds community and gives purpose. modern life is too isolated. this fixes that.",
    "i'm 24 and i feel like this is exactly what my generation needs. we can't afford houses and we're lonely. this solves both.",
    "the cruise model on land is actually genius. someone finally connected the dots. i've been saying this for years.",
    "wait so i can just walk outside, grab a tesla, go to work, come back, eat dinner with friends, then volunteer on the farm? that's a movie.",
    "i'm paying $1800 for a room in a shared house with 4 strangers and no AC. this sounds like heaven compared to that.",
    "what's the vetting process like? like do you background check? i just wanna make sure it's safe."
  ],
  emotionalHeartfelt: [
    "i'm crying this is literally everything i've ever wanted",
    "not me getting emotional over a housing community 💀",
    "why am i tearing up lol this is beautiful",
    "i'm not crying you're crying",
    "this gave me hope fr",
    "i needed to see something like this today",
    "2026 is rough but this made me smile",
    "thank you for doing this seriously",
    "whoever thought of this is a genius",
    "i feel hope for the first time in years",
    "needed this energy thank you",
    "who's cutting onions in here",
    "this is how change happens",
    "look at all these people ready to build something",
    "faith in humanity restored"
  ]
};

// Define burst patterns (sequence of category picks)
// Each pattern is an array of { category, count }
const burstPatterns = [
  // Pattern 1: Greetings first, then questions, then excitement
  [
    { category: "greetings", count: 2 },
    { category: "joinedAfterVideo", count: 1 },
    { category: "firstImpressions", count: 2 },
    { category: "questions", count: 1 },
    { category: "excitedReady", count: 1 }
  ],
  // Pattern 2: Food focus
  [
    { category: "greetings", count: 1 },
    { category: "foodDining", count: 3 },
    { category: "longerMessages", count: 1 },
    { category: "genzAbbreviations", count: 1 }
  ],
  // Pattern 3: Tesla hype
  [
    { category: "joinedAfterVideo", count: 2 },
    { category: "teslas", count: 3 },
    { category: "excitedReady", count: 1 },
    { category: "emotionalHeartfelt", count: 1 }
  ],
  // Pattern 4: Skeptical then convinced
  [
    { category: "skeptical", count: 2 },
    { category: "pricing", count: 1 },
    { category: "firstImpressions", count: 1 },
    { category: "longerMessages", count: 1 },
    { category: "excitedReady", count: 1 }
  ],
  // Pattern 5: Farming & sustainability
  [
    { category: "greetings", count: 1 },
    { category: "agriculture", count: 2 },
    { category: "foodDining", count: 1 },
    { category: "volunteering", count: 1 },
    { category: "emotionalHeartfelt", count: 1 }
  ],
  // Pattern 6: Rapid fire short messages (gen z style)
  [
    { category: "genzAbbreviations", count: 3 },
    { category: "joinedAfterVideo", count: 1 },
    { category: "teslas", count: 1 },
    { category: "excitedReady", count: 1 }
  ],
  // Pattern 7: Question heavy (curious audience)
  [
    { category: "greetings", count: 1 },
    { category: "questions", count: 3 },
    { category: "pricing", count: 1 },
    { category: "longerMessages", count: 1 }
  ],
  // Pattern 8: Emotional / heartfelt wave
  [
    { category: "emotionalHeartfelt", count: 2 },
    { category: "longerMessages", count: 1 },
    { category: "excitedReady", count: 2 },
    { category: "genzAbbreviations", count: 1 }
  ],
  // Pattern 9: Mixed reactions (realistic chaos)
  [
    { category: "greetings", count: 1 },
    { category: "joinedAfterVideo", count: 1 },
    { category: "foodDining", count: 1 },
    { category: "teslas", count: 1 },
    { category: "skeptical", count: 1 },
    { category: "genzAbbreviations", count: 1 }
  ],
  // Pattern 10: Long detailed + short reactions
  [
    { category: "longerMessages", count: 2 },
    { category: "genzAbbreviations", count: 2 },
    { category: "excitedReady", count: 1 },
    { category: "emotionalHeartfelt", count: 1 }
  ]
];



/* -----------------------------
API HANDLER
------------------------------ */

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const ip =
    req.headers['x-forwarded-for'] ||
    req.socket.remoteAddress;

  try {

    /* --------------------------------
       POST → USER SEND MESSAGE
    -------------------------------- */

    if (req.method === 'POST') {

      const { message, name, clerkId } = req.body;

      if (!message?.trim() || message.length > 500) {
        return res.status(400).json({
          error: "Invalid message"
        });
      }

      if (!name?.trim()) {
        return res.status(400).json({
          error: "Name required"
        });
      }

      const cleanIp = ip.replace(/[^a-zA-Z0-9]/g, '_');

      const minuteBucket =
        Math.floor(Date.now() / 60000);

      const rateKey =
        `chat_rate/${cleanIp}/${minuteBucket}`;

      const rateCheck =
        await db.ref(rateKey).once('value');

      if (rateCheck.val() >= 3) {
        return res.status(429).json({
          error: "Slow down!"
        });
      }

      await db.ref(rateKey)
        .transaction(c => (c || 0) + 1);

      const chatKey =
        await db.ref("chats-webinar").push({

          text: message.trim(),

          clerkId: clerkId || "anonymous",

          name: name.trim().substring(0, 50),

          ip: cleanIp,

          timestamp: Date.now(),

          source: "user"

        }).key;

      res.json({
        success: true,
        messageId: chatKey
      });

    }

    /* --------------------------------
       PUT → ACTIVE USER HEARTBEAT
    -------------------------------- */

    else if (req.method === "PUT") {

      const { clerkId } = req.body;

      if (!clerkId) {
        return res.status(400).json({
          error: "clerkId required"
        });
      }

      await db.ref(`active-webinar-users/${clerkId}`).set({
        lastActive: Date.now()
      });

      res.json({
        success: true
      });

    }

    /* --------------------------------
       GET → FETCH MESSAGES + AUTO CHAT
    -------------------------------- */

    else if (req.method === 'GET') {

      const now = Date.now();

      /* CHECK ACTIVE USERS */
      const activeSnap = await db.ref("active-webinar-users").once("value");

      let activeUsers = 0;

      activeSnap.forEach(user => {
        const data = user.val();

        if (now - data.lastActive < 60000) {
          activeUsers++;
        } else {
          db.ref(`active-webinar-users/${user.key}`).remove();
        }
      });

      /* GENERATE FAKE MESSAGES (NOT SAVED) */
      /* GENERATE FAKE MESSAGES (NOT SAVED) */
      let fakeMessages = [];

      if (activeUsers > 0) {

        // const patterns = [1000, 2000, 3000, 5000, 8000];
        const patterns = [12000, 18000, 25000, 35000, 45000];
        const delay = patterns[Math.floor(Math.random() * patterns.length)];

        const lastMsgSnap = await db.ref("chats-webinar")
          .orderByChild("timestamp")
          .limitToLast(1)
          .once("value");

        let lastTime = 0;

        lastMsgSnap.forEach(s => {
          lastTime = s.val().timestamp;
        });

        if (now - lastTime > delay) {

          // Pick a random burst pattern
          const pattern = burstPatterns[Math.floor(Math.random() * burstPatterns.length)];

          // Calculate total burst count from pattern
          let totalBurstCount = 0;
          pattern.forEach(segment => {
            totalBurstCount += segment.count;
          });

          // Also add random extra messages (1-3) to make it organic
          // const extraMessages = Math.floor(Math.random() * 3);
          const extraMessages = Math.floor(Math.random() * 1);
          const finalBurstCount = totalBurstCount + extraMessages;

          // Build the burst messages following the pattern
          const burstMessages = [];

          // First, follow the pattern
          // for (const segment of pattern) {
          //   const category = messageCategories[segment.category];
          //   if (category) {
          //     // Pick random messages from this category (with possible repeats allowed)
          //     for (let i = 0; i < segment.count; i++) {
          //       const randomIndex = Math.floor(Math.random() * category.length);
          //       burstMessages.push(category[randomIndex]);
          //     }
          //   }
          // }

          for (const segment of pattern) {

            // Reduce message count by 60%
            const reducedCount = Math.max(
              1,
              Math.ceil(segment.count * 0.4)
            );

            const category = messageCategories[segment.category];

            if (category) {

              for (let i = 0; i < reducedCount; i++) {

                const randomIndex =
                  Math.floor(Math.random() * category.length);

                burstMessages.push(category[randomIndex]);
              }
            }
          }

          // Then add random extra messages from any category (for organic variety)
          const allCategories = Object.values(messageCategories);
          for (let i = 0; i < extraMessages; i++) {
            const randomCategory = allCategories[Math.floor(Math.random() * allCategories.length)];
            const randomMessage = randomCategory[Math.floor(Math.random() * randomCategory.length)];
            burstMessages.push(randomMessage);
          }

          // Shuffle slightly to avoid being too predictable (but keep general flow)
          // Only swap a few positions to maintain pattern integrity
          for (let s = 0; s < Math.floor(burstMessages.length / 3); s++) {
            const idx1 = Math.floor(Math.random() * burstMessages.length);
            const idx2 = Math.floor(Math.random() * burstMessages.length);
            [burstMessages[idx1], burstMessages[idx2]] = [burstMessages[idx2], burstMessages[idx1]];
          }

          // Create fake message objects
          for (let i = 0; i < burstMessages.length; i++) {
            const text = burstMessages[i];
            const name = autoNames[Math.floor(Math.random() * autoNames.length)];

            fakeMessages.push({
              name,
              text,
              timestamp: Date.now() + i, // Slight timestamp difference to maintain order
              source: "system"
            });
          }
        }
      }


      /* FETCH REAL MESSAGES */
      const snapshot = await db.ref("chats-webinar")
        .orderByChild("timestamp")
        .limitToLast(50)
        .once("value");

      const messages = [];

      snapshot.forEach(snap => {
        messages.push(snap.val());
      });

      res.json({
        success: true,
        messages,
        fakeMessages
      });
    }

  }
  catch (error) {

    console.error("Chat error:", error);

    res.status(500).json({
      error: "Server error"
    });

  }

}