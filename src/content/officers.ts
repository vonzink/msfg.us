/**
 * Loan officer directory data — single source of truth for /loan-officers.
 *
 * Real MSFG staff (Mountain State Financial Group, LLC · Company NMLS #1314257).
 * Names, titles, NMLS IDs, contact details, license states, headshots, bios and
 * apply links come from the company roster. Headshots live in
 * `public/officers/<slug>.webp`. This module is also a seed source for Postgres
 * (see prisma/seed.ts).
 */

export type Officer = {
  /** URL-safe id — headshot filename (`public/officers/<slug>.webp`) + card anchor. */
  slug: string;
  /** Display name (may include a credential suffix, e.g. "Robert Hoff, CFA"). */
  name: string;
  /** Role/title, e.g. "President", "Executive VP", "Licensed Mortgage Broker". */
  title: string;
  /** NMLS unique identifier (string to preserve leading digits). */
  nmls: string;
  /** Work email (mailto:). */
  email: string;
  /** Display phone, e.g. "(720) 838-1246"; tel:/sms: derived via telDigits(). */
  phone: string;
  /** USPS two-letter state codes the officer is licensed in. Drives the filter. */
  states: string[];
  /** Headshot path under public/, e.g. "/officers/robert-hoff.webp". */
  photo: string;
  /** Bio paragraphs; empty array when no bio is available. */
  bio: string[];
  /** Personal "Apply now" link (blink.mortgage). */
  applyHref: string;
};

/** USPS code → full state name, for the states the roster covers. */
const STATE_NAMES: Record<string, string> = {
  CO: "Colorado",
  ND: "North Dakota",
  MN: "Minnesota",
  SD: "South Dakota",
  TX: "Texas",
  IN: "Indiana",
  MI: "Michigan",
};

/** Full state name for a USPS code, falling back to the code itself. */
export function stateName(code: string): string {
  return STATE_NAMES[code] ?? code;
}

/** tel:/sms:-ready number from a display phone ("(720) 838-1246" → "+17208381246"). */
export function telDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `+1${d}` : `+${d}`;
}

export const OFFICERS: Officer[] = [
  {
    slug: "robert-hoff",
    name: "Robert Hoff, CFA",
    title: "President",
    nmls: "608235",
    email: "robert.hoff@msfg.us",
    phone: "(720) 838-1246",
    states: ["CO", "ND"],
    photo: "/officers/robert-hoff.webp",
    bio: [
      "After spending many successful years in the financial services industry, I decided it was time to truly utilize all that I had learned and start a better company. A company that didn't get bogged down in red tape or bureaucracy and instead focused on what was truly best for the clients and our team. This simple model has been hugely successful in helping thousands of clients while allowing us to care for our ever-expanding team.",
      "Working with Mountain State Financial Group, LLC has been hugely gratifying. We relish the opportunity to do things right and strive to deliver what we say we'll deliver 100 percent of the time. We're building a brand on that promise, and it's working really well. I'm happy, my colleagues are happy and, best of all, our clients get the professional service and expertise they deserve and want in a lender.",
      "My strongest relationships outside of professional circles and my family are the friends I made as a boy in Bismarck, ND, including a few colleagues. We understand one another and share the same values and work ethic. We're all here to make a difference for people.",
      "I received a B.B.A. in Financial Management from the University of North Dakota and a Master of Security Analysis and Portfolio Management from Creighton University. I have also earned the Chartered Financial Analyst (CFA) designation to deepen my understanding of financial and investment strategies and to apply this knowledge in further assisting our clients.",
      "When I'm not helping our great clients achieve their goals, I love spending time outdoors with my family and friends year round, either camping or skiing. I also enjoy golfing and fishing although I lack skill in both! Mostly, I love working with my friends at Mountain State Financial Group, LLC and continuing to create a brand based on competitive pricing and exceptional service and delivery.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc",
  },
  {
    slug: "seth-angell",
    name: "Seth Angell",
    title: "Executive VP",
    nmls: "912881",
    email: "seth.angell@msfg.us",
    phone: "(303) 883-8519",
    states: ["CO", "IN", "MI", "MN", "ND"],
    photo: "/officers/seth-angell.webp",
    bio: [
      "As the Executive Vice President at Mountain State Financial Group, LLC, I bring nearly 20 years of experience in residential lending to the table. My focus is always on delivering a transparent, efficient, and empowering mortgage experience for every client. I take pride in helping people make one of the biggest financial decisions of their lives with clarity and confidence, and I'm deeply committed to the success of both our clients and our team.",
      "Before entering the mortgage industry, I spent several years as a teacher—a background that still shapes how I approach this work today. I've found that my ability to break down complex concepts into straightforward, actionable steps has become one of my greatest strengths as a loan officer and leader. Whether I'm guiding a first-time homebuyer or structuring a complex investment deal, I always aim to educate, not just execute.",
      "At Mountain State Financial Group, LLC, I help lead a team of professionals who are truly experts in the mortgage business. We blend deep industry knowledge with cutting-edge tools to offer solutions that fit our clients' unique goals. I believe in staying ahead of market trends, being proactive, and communicating openly—because in lending, confidence comes from understanding and trust.",
      "Outside the office, I love spending time outdoors—whether I'm golfing, fishing, or just enjoying the Colorado sunshine. I'm also a die-hard Minnesota sports fan, which means I've learned to appreciate loyalty and perseverance no matter the scoreboard. That same mindset drives my approach to work: show up, do the right thing, and stay all-in for the long haul.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/sethangell",
  },
  {
    slug: "tanya-long",
    name: "Tanya Long",
    title: "Licensed Mortgage Broker",
    nmls: "1634834",
    email: "tanya.long@msfg.us",
    phone: "(701) 471-1687",
    states: ["CO", "MI", "MN", "ND", "SD", "TX"],
    photo: "/officers/tanya-long.webp",
    bio: [
      "I've been part of Mountain State Financial Group, LLC since 2017. In 2023, I achieved the designation of Certified Mortgage Advisor, marking a significant milestone in my professional journey.",
      "Throughout my time at Mountain State Financial Group, LLC, I've had the privilege of assisting individuals in realizing their dreams of homeownership. My focus has always been on building meaningful connections and providing support during this important life journey.",
      "I'm grateful and honored to have been named 'Best Loan Officer' in the Bismarck Tribune's Best of the Best contest for three consecutive years, from 2021 to 2023. This acknowledgment is a reflection of the trust and satisfaction of the individuals I've had the pleasure of working with. Additionally, being awarded 'Affiliate of the Year' by the Bismarck/Mandan Board of Realtors in 2021 was a meaningful highlight, emphasizing the importance of collaboration within the real estate community.",
      "Achieving the Certified Mortgage Advisor designation in 2023 has equipped me with valuable knowledge and expertise in navigating the complexities of the mortgage landscape. With over 600 loans closed in my career, I bring a wealth of experience to every client interaction.",
      "What matters most to me is the connection I build with each client. I strive to bring a caring and personalized approach to every interaction, recognizing the significance of the decisions my clients are making. I'm dedicated to helping others navigate the sometimes challenging path to homeownership.",
      "If you're in search of someone with both experience and a commitment to your unique journey, I'm here and eager to assist. Let's work together to make your homeownership dreams a reality!",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/tanyalong",
  },
  {
    slug: "zachary-zink",
    name: "Zachary Zink",
    title: "Licensed Mortgage Broker",
    nmls: "451924",
    email: "zachary.zink@msfg.us",
    phone: "303-870-6518",
    states: ["CO", "ND"],
    photo: "/officers/zachary-zink.webp",
    bio: [
      "With over two decades of experience in the mortgage industry, I bring a wealth of knowledge and expertise to my role at Mountain State Financial Group, LLC. My career began in 2002 at Washington Mutual (WAMU), where I honed my skills in various facets of the mortgage process. My journey through the industry has been diverse and enriching, encompassing roles in wholesale, pricing, underwriting, processing, business lending, and management.",
      "From 2008 to 2017, I had the opportunity to work with reputable institutions like Keybank, Bank of the West, and Vectra Bank. This period was instrumental in shaping my understanding of different market dynamics and consumer needs. In my quest for more meaningful and impactful work, I joined forces with Robert Hoff and Seth Angell to build Mountain State Financial Group. Our vision was clear: to offer traditional lending products with a personalized touch that outshines the service of larger lenders.",
      "At MSFG, we prioritize a blend of professional expertise and personal attention to each client. Recognizing the evolving landscape of the mortgage industry, we leverage cutting-edge technology to streamline processes. Our focus on direct integration and AI-enhanced communication ensures efficiency and a seamless experience for our clients.",
      "As a system administrator, I am particularly passionate about harnessing technology to enhance our services. Our team at Mountain State Financial Group, LLC is dedicated to delivering top-notch mortgage solutions, guided by integrity, transparency, and a deep understanding of our clients' needs.",
      "I believe that a mortgage is more than just a financial transaction; it's a step towards realizing personal dreams and ambitions. My approach is grounded in building lasting relationships with our clients, offering them not just financial solutions, but also guidance and support through one of their most significant life decisions.",
      "If you're looking for expert advice and a personalized mortgage experience, I'd love to connect with you. Let's explore how we can make your homeownership dreams a reality.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/zacharyzink?campaign=zinkteammortgage",
  },
  {
    slug: "tracy-roberts",
    name: "Tracy Roberts",
    title: "Licensed Mortgage Broker",
    nmls: "1611992",
    email: "tracy.roberts@msfg.us",
    phone: "(701) 934-0636",
    states: ["CO", "MN", "ND", "SD"],
    photo: "/officers/tracy-roberts.webp",
    bio: [
      "As a Mortgage Broker with Mountain State Financial Group, I bring more than a decade of mortgage lending experience to clients throughout North Dakota, Minnesota, South Dakota, and Colorado.",
      "My goal is to provide clear guidance, honest communication, and personalized financing solutions that help borrowers feel confident throughout the home financing process.",
      "Over the years, I've had the privilege of helping first-time homebuyers, veterans, military families, and homeowners navigate one of the most important financial decisions of their lives.",
      "Whether purchasing a home or refinancing an existing mortgage, I believe every client deserves a lending partner who takes the time to listen, educate, and advocate for their goals.",
      "As a Marine Corps spouse and parent of an Air Force service member, I understand the unique challenges military families face during relocations, PCS moves, and home purchases.",
      "Helping veterans and military families achieve homeownership is one of the most rewarding aspects of my career.",
      "I take pride in building lasting relationships through responsiveness, transparency, and service.",
      "Combining local market knowledge with personalized mortgage solutions across North Dakota, Minnesota, South Dakota, and Colorado, I am committed to helping clients achieve their homeownership goals with confidence.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/tracyroberts",
  },
  {
    slug: "laura-schloer",
    name: "Laura Schloer",
    title: "Licensed Mortgage Broker",
    nmls: "1726218",
    email: "laura.schloer@msfg.us",
    phone: "(701) 400-3171",
    states: ["CO", "MN", "ND", "SD"],
    photo: "/officers/laura-schloer.webp",
    bio: [
      "Since learning about Mountain State Financial Group, LLC and its founders, with their philosophy of providing honest and outstanding pricing and service, I knew I wanted to be a part of it. Saving people time and money without extra fees and headaches aligned with exactly what I wanted to be able to offer my clients, friends, and family in North Dakota.",
      "I grew up in Minot, ND and after high school I went to both UND and Minot State University. I have lived in Bismarck since 1997 and have 2 great beautiful kids who are my 'Why' for everything I do in life. They are embarking on their 'Adulting' stage in life, so I now get to sit back and watch them make their own decisions and life choices and see if they listened to 'Mom' at all growing up!",
      "I retired from 33 years of Law Enforcement in 2020 and have jumped headfirst into this new professional chapter of my life. Law Enforcement is part of my DNA, and my 'Blue Family' will always be just that, family. I am grateful, honored and humbled from the time spent in my career & because of the people I have met and experiences I have had. This new chapter is so rewarding because I still get to help people and love hearing their stories about their families and life. Being licensed in Minnesota, South Dakota, and Colorado, as well as North Dakota allows me to reach more families.",
      "My hobbies are family, riding my Harley and anything in or on the water. Wind and water therapy cures a lot of things!! Now I need something in the winter. I believe my integrity, strong work ethic, and love for helping people are beneficial for our customers. I work hard for my clients with purchase and refinancing needs. The personalized customer service we offer along with being available evenings and weekends is a game-changer in my mind. Let me help you with one of the biggest and most exciting purchases you will ever make and not only save you time and money but also make it as easy and fun as possible.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/lauraschloer?campaign=lauraschloer",
  },
  {
    slug: "michael-grensteiner",
    name: "Michael Grensteiner",
    title: "Licensed Mortgage Broker",
    nmls: "1948625",
    email: "michael.grensteiner@msfg.us",
    phone: "(701) 214-8705",
    states: ["MN", "ND"],
    photo: "/officers/michael-grensteiner.webp",
    bio: [
      "I grew up in Bismarck, ND and have lived here most of my life. I am a graduate of Bismarck High School and the University of North Dakota. I lived in Grand Forks for several years, where I met my wife, Amanda. After moving back to Bismarck in 2003, I worked as a Business Manager for 8 years. From there, I got into the housing business and have been doing it ever since.",
      "I have been best of friends with Robert, Seth and a few other employees of Mountain State Financial Group since I was a kid. After talking about joining the company for the last few years, I decided to take the leap. Knowing how successful, honest, and hardworking Robert and Seth have been in the financing world, it made it an easier decision to join Mountain State Financial Group, LLC. My wife and I have been blessed with 2 wonderful little kids- Ella and Eli. Away from work, I love spending quality time with my family and friends.",
      "The best part of my working career has been building relationships with customers. I truly love knowing that I helped someone or a family get a new home. I believe if a customer puts their faith in me, it is my job to honestly and whole-heartedly find them the best loan for their needs. I am passionate about what I do and am always a quick phone call, message, or email away. Contact me any time for a free consultation. 701-214-8705",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/michaelgrensteiner",
  },
  {
    slug: "kimberly-thomas",
    name: "Kimberly Thomas",
    title: "Licensed Mortgage Broker",
    nmls: "2132868",
    email: "kimberly.thomas@msfg.us",
    phone: "(512) 745-2821",
    states: ["CO", "MN", "ND", "TX"],
    photo: "/officers/kimberly-thomas.webp",
    bio: [
      "I am excited to join the Mountain State Financial Group, LLC family. And it is literally family. My cousin Bob is the President and sisters Tanya and Kara also work for the company. I have been in the financial services industry for over 10 years and client care and customer service have always been my primary focus. Buying a home is one of the biggest financial decisions you can make, and it can be a scary process if you do not have someone looking out for your best interest. My philosophy is to treat every client like I would want someone to treat my parents. My promise is to listen to your goals and provide a clear path on how to get you the best possible rate for your home.",
      "When I'm not working, I enjoy traveling, spending time with family and friends, and watching football. I was born and raised in ND and went to school at NDSU so that makes me a HUGE Bison football fan. I have enjoyed watching the NFL teams where our Bison players end up. I live in Austin, TX but spend my summers in ND to be closer to my family and get out of the Texas heat.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc",
  },
  {
    slug: "jeremy-cox",
    name: "Jeremy Cox",
    title: "Licensed Mortgage Broker",
    nmls: "2041243",
    email: "jeremy.cox@msfg.us",
    phone: "(330) 219-5065",
    states: ["IN"],
    photo: "/officers/jeremy-cox.webp",
    bio: [
      "As a public servant for over 25 years, I bring my compassion for the community and attention to detail to offer you the best product and service to maximize your home buying potential. Buying and selling properties over the years exposed my lack of understanding of the home financing process. I decided to devote myself to learning the industry. I look forward to taking just a little more time to explain products and processes and understand the families who so graciously trust me with the privilege of reaching their goals and share their excitement of home ownership.",
      "I am a husband and father of two boys. I value family and community involvement. I love spending time on the water with my family and friends. I enjoy music and play a few instruments. I am thankful and proud to represent Mountain State Financial Group, LLC here in Indiana. I am confident that we can offer superb products and service and appreciate the opportunity to work for your family.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/jeremycox",
  },
  {
    slug: "josh-sourial",
    name: "Josh Sourial",
    title: "Licensed Mortgage Broker",
    nmls: "853931",
    email: "joshua.sourial@msfg.us",
    phone: "(303) 810-2875",
    states: ["CO"],
    photo: "/officers/josh-sourial.webp",
    bio: [
      "With over 18 years of rich experience in the dynamic world of finance and loans, my journey has spanned from the bustling car business to the intricate realms of commercial and mortgage lending. My career has been driven by a fervent passion for guiding clients through the maze of financing options, tailoring solutions to fit even the most unique circumstances. This dedication to client service has blossomed into enduring relationships, transforming clients into lifelong friends and partners in financial planning.",
      "When Bob Hoff and Seth Angell, pioneers at the esteemed Mountain State Financial Group, LLC, extended an invitation to join their visionary team, it was a resounding 'yes' from me! My personal connections, including family and friends, have long trusted MSFG, witnessing firsthand their commitment to building lasting bonds and delivering exceptional mortgage services. Their ethos resonated with my own, and I knew that joining this family was not just a career move, but a homecoming.",
      "Colorado has been my backdrop for life's adventures for 20 years, a place where my heart found its partner in a native Coloradan. Together, we are blessed with three incredible children, two spirited boys and a delightful girl who fill our lives with laughter, love, and endless energy. My leisure time is a blend of family moments, invigorating workouts, camaraderie with friends, and immersing myself in the breathtaking Colorado landscapes.",
      "I extend an open invitation to you to reach out. Let's embark on a journey to not just meet, but exceed your financial aspirations. With my expertise and your vision, we'll navigate the path to your financial success together.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/joshuasourial",
  },
  {
    slug: "jessica-haukeness",
    name: "Jessica Haukeness",
    title: "Licensed Mortgage Broker",
    nmls: "1275913",
    email: "jessica.haukeness@msfg.us",
    phone: "(720) 666-4126",
    states: ["CO"],
    photo: "/officers/jessica-haukeness.webp",
    bio: [
      "I am a Colorado native living in Arvada with my husband, daughter, and two puppies. With 12 years of financial experience at Wells Fargo, Elevations Credit Union, and Mutual Security Mortgage, I am passionate about helping my clients achieve their financial goals.",
      "I take pride in sitting down with my clients, getting to know them, and finding the right loan solutions to fit their needs. I'm happy to meet in the evenings and on weekends, always providing personalized customer service.",
      "In my free time, I love spending time with my daughter, bowling with my husband and friends, and watching scary movies with my husband.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/jessicahaukeness",
  },
  {
    slug: "kray-olson",
    name: "Kray Olson",
    title: "Licensed Mortgage Broker",
    nmls: "1894087",
    email: "kray.olson@compassHL.us",
    phone: "(701) 425-2223",
    states: ["MN", "ND", "SD"],
    photo: "/officers/kray-olson.webp",
    bio: [
      "I'd like to thank you for taking a little time out of your busy day to learn more on how I will work for you. I believe it's important for you to know who you are working with especially when they are providing you with something as significant as your home mortgage. First and foremost, I'm a husband, father, youth sports coach, outdoor enthusiast, and active member of our community. I'm also a licensed mortgage broker, serving clients in North Dakota, Minnesota, and South Dakota. As important as it is for you to know who I am, it's equally so, I believe, that I get to know each and every one of my clients. That understanding doesn't just build trust; it also gives me all the information I need to get you the very best mortgage the market has to offer.",
      "Mountain State Financial Group works directly with more than 20 different lenders throughout the United States. Instead of walking into my office and saying, 'here's today's rates', I find the best loan for you. All lenders specialize in different products for different needs and I will do the shopping to find you the best fit. Whether you are purchasing your first home, planning a big move, or would like to refinance your property, my methodical yet personal approach in the way I offer my services as a mortgage broker guarantees the best loan option with the lowest rate and costs.",
      "You could say I'm a detailed numbers guy at heart, as I started my career as a Chemical Engineer and then transitioned to finance. I earned a Master of Project Management from the University of Mary, an MBA from North Dakota State University, and I now apply these tools to ensure financial mortgage savings for you. My attention to detail provides an accurate application and a proactive loan management process that ensures a flawless mortgage experience. Work with me, and you'll have a pre-approval within the hour, allowing you to close on your new home in a matter of weeks.",
      "Ultimately the mortgage business is more about people than the numbers. That's why I emphasize great communication. Not only am I available morning, noon, and night, but I keep you informed along the way so you never wonder what is the status of your loan or what step is coming next. Coupling this focus on service with no origination and no underwriting fees, provides you with the best service for the lowest cost. I say let's keep more of your money right where it belongs: in your pocket.",
      "When it comes to buying a new home, I make the most important step the easiest step. Please give me a call anytime at (701) 425-2223 so we can get started!",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/krayolson",
  },
  {
    slug: "sandra-simental",
    name: "Sandra Simental",
    title: "Mortgage Broker",
    nmls: "283846",
    email: "sandra.simental@msfg.us",
    phone: "(720) 290-8826",
    states: ["CO"],
    photo: "/officers/sandra-simental.webp",
    bio: [],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/sandrasimental",
  },
  {
    slug: "zayen-krause",
    name: "Zayen Krause",
    title: "Licensed Mortgage Broker",
    nmls: "1419423",
    email: "zayen.krause@msfg.us",
    phone: "(763) 228-3269",
    states: ["CO", "MN", "SD"],
    photo: "/officers/zayen-krause.webp",
    bio: [
      "Hi, I'm Zayen Krause, a Mortgage Loan Originator at Mountain State Financial Group (MSFG).",
      "Originally from North Dakota, I graduated from St. Cloud State University in Minnesota with an undergraduate degree in Management. My background includes 10 years in aviation and 20 years in management and sales.",
      "I have always been passionate about finance and banking, so when the opportunity arose to move to Colorado and work in the financial industry, I eagerly accepted. My interest in mortgage lending stems from my own home-buying experience in 2005. At the time, the market was at its peak, and I found that many banks and loan officers were pushy and unwilling to take the time to explain different loan options. Instead of helping me find the best financing solution for my specific needs, I was placed in a loan that was not a good fit. Over the next several years, I spent countless hours trying to refinance—often stuck on hold with overseas call centers, struggling to resolve issues.",
      "That difficult experience motivated me to become a mortgage professional. I knew I could do better—and that people deserved better. As your mortgage loan originator, I serve as your personal advocate, working with and for you to secure the best loan option tailored to your financial situation.",
      "I'm thrilled to call Colorado home. I love the outdoors and appreciate the active, healthy lifestyle that this beautiful state offers. Since Colorado was always one of my favorite vacation destinations, relocating here was an easy decision.",
      "If you have any questions, please don't hesitate to reach out. Remember, I work for you, and I'm here to help you find the financing that best fits your needs.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/zayenkrause",
  },
  {
    slug: "noah-youngs",
    name: "Noah Youngs",
    title: "Licensed Mortgage Broker",
    nmls: "2608605",
    email: "noah.youngs@msfg.us",
    phone: "(763) 234-2264",
    states: ["MN"],
    photo: "/officers/noah-youngs.webp",
    bio: [
      "I came to Mountain State Financial Group, LLC in 2024. Working daily with a variety of people as a restaurant manager and as a public-school teacher has allowed me to gather an understanding of how to help people with their unique situations. This experience fits well in my new role as a licensed mortgage broker.",
      "As a husband, father of three children, and grandfather of two, I understand the importance of home ownership. I believe that owning a home is a great way for a family to create a stable and loving environment. I am excited to be able to help people achieve that.",
      "I was raised in Monticello, Minnesota, and still live there today. I am licensed in the State of Minnesota and will be working with the staff of MSFG to ensure that every loan will be processed with expertise. Their commitment to honesty and integrity is one of the reasons I have moved to the mortgage industry.",
    ],
    applyHref:
      "https://www.blink.mortgage/app/signup/p/mountainstatefinancialgroupllc/noahyoungs",
  },
];

/** Distinct license states across officers, as {code,name}, sorted by name. */
export function officerStates(
  officers: Officer[] = OFFICERS,
): { code: string; name: string }[] {
  const seen = new Set<string>();
  for (const o of officers) for (const s of o.states) seen.add(s);
  return [...seen]
    .map((code) => ({ code, name: stateName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
