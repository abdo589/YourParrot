export type CategoryId = "birds" | "cages" | "food" | "toys" | "care";

export type ArtKind = "parrot" | "cage" | "food" | "toy" | "care";

export interface Palette {
  /** Main body / object color */
  primary: string;
  /** Wing / secondary color */
  secondary: string;
  /** Head, beak or highlight color */
  accent: string;
  /** Card background tint */
  tint: string;
}

export interface Product {
  slug: string;
  name: string;
  category: CategoryId;
  price: number;
  oldPrice?: number;
  stock: number;
  short: string;
  description: string;
  features: string[];
  specs: { label: string; value: string }[];
  art: ArtKind;
  palette: Palette;
  badge?: string;
  featured?: boolean;
}

export const categories: { id: CategoryId; name: string; blurb: string }[] = [
  { id: "birds", name: "ببغاوات", blurb: "طيور مُربّاة في الأسر بأوراق نظامية وشهادة صحية" },
  { id: "cages", name: "أقفاص", blurb: "أقفاص واسعة وآمنة من الستانلس" },
  { id: "food", name: "أغذية", blurb: "خلطات بذور وحبوب ومكملات" },
  { id: "toys", name: "ألعاب", blurb: "ألعاب تنمّي الذكاء وتمنع الملل" },
  { id: "care", name: "عناية", blurb: "فيتامينات وأدوات نظافة" },
];

export const products: Product[] = [
  {
    slug: "african-grey",
    name: "ببغاء كاسكو أفريقي رمادي",
    category: "birds",
    price: 6500,
    oldPrice: 7200,
    stock: 2,
    short: "أذكى أنواع الببغاوات وأقدرها على تقليد الكلام.",
    description:
      "الكاسكو الرمادي معروف بذكائه الاستثنائي وقدرته على تعلّم مئات الكلمات. الطائر مُربّى يدويًا، أليف، ومعتاد على التعامل مع الناس. يُسلَّم مع شهادة صحية وحلقة تعريف وكتيّب رعاية.",
    features: ["مُربّى يدويًا وأليف", "شهادة صحية بيطرية", "حلقة تعريف مغلقة", "متابعة مجانية لمدة شهر"],
    specs: [
      { label: "العمر", value: "6 أشهر" },
      { label: "متوسط العمر", value: "40–60 سنة" },
      { label: "القدرة على الكلام", value: "ممتازة" },
      { label: "الحجم", value: "33 سم" },
    ],
    art: "parrot",
    palette: { primary: "#8a9199", secondary: "#5f666e", accent: "#c8322b", tint: "#e8ebee" },
    badge: "الأكثر طلبًا",
    featured: true,
  },
  {
    slug: "blue-gold-macaw",
    name: "ببغاء مكاو أزرق وذهبي",
    category: "birds",
    price: 18500,
    stock: 1,
    short: "ألوان مبهرة وشخصية اجتماعية قوية.",
    description:
      "المكاو الأزرق والذهبي من أكبر الببغاوات وأجملها. اجتماعي جدًا ويحب الاهتمام، ويحتاج مساحة واسعة وتفاعلًا يوميًا. مناسب للمربّين ذوي الخبرة.",
    features: ["مُربّى يدويًا", "شهادة صحية", "استشارة تجهيز المكان مجانًا"],
    specs: [
      { label: "العمر", value: "8 أشهر" },
      { label: "متوسط العمر", value: "50–70 سنة" },
      { label: "القدرة على الكلام", value: "جيدة" },
      { label: "الحجم", value: "86 سم" },
    ],
    art: "parrot",
    palette: { primary: "#1f6fd1", secondary: "#f2b705", accent: "#1d2b3a", tint: "#e4eefb" },
    featured: true,
  },
  {
    slug: "cockatiel",
    name: "ببغاء كوكاتيل",
    category: "birds",
    price: 350,
    stock: 12,
    short: "لطيف وهادئ ومثالي للمبتدئين.",
    description:
      "الكوكاتيل من أسهل الببغاوات في التربية، يحب الصفير ويتعلّم الألحان بسرعة. هادئ ومناسب للشقق والعائلات التي بها أطفال.",
    features: ["مناسب للمبتدئين", "صوت هادئ", "سهل الترويض"],
    specs: [
      { label: "العمر", value: "3 أشهر" },
      { label: "متوسط العمر", value: "15–20 سنة" },
      { label: "القدرة على الكلام", value: "متوسطة (صفير)" },
      { label: "الحجم", value: "30 سم" },
    ],
    art: "parrot",
    palette: { primary: "#b9b4a8", secondary: "#8c877c", accent: "#f2c230", tint: "#f4f1ea" },
    featured: true,
  },
  {
    slug: "lovebird-pair",
    name: "زوج طيور الحب (روز)",
    category: "birds",
    price: 300,
    stock: 8,
    short: "زوج متآلف بألوان زاهية.",
    description:
      "طيور الحب نشيطة ومرحة وتعيش في أزواج. يُباع الزوج متآلفًا وجاهزًا للعيش معًا، بألوان أخضر وخوخي جميلة.",
    features: ["زوج متآلف", "ألوان زاهية", "نشيطة ومرحة"],
    specs: [
      { label: "العمر", value: "4 أشهر" },
      { label: "متوسط العمر", value: "10–15 سنة" },
      { label: "القدرة على الكلام", value: "محدودة" },
      { label: "الحجم", value: "15 سم" },
    ],
    art: "parrot",
    palette: { primary: "#3fae49", secondary: "#2b7a33", accent: "#f08a5d", tint: "#e6f5e7" },
  },
  {
    slug: "budgie",
    name: "ببغاء بادجي (الدُّرة)",
    category: "birds",
    price: 75,
    stock: 30,
    short: "صغير، اجتماعي، ويتعلّم كلمات بسيطة.",
    description:
      "البادجي من أشهر الطيور المنزلية، صغير الحجم وقليل التكلفة، ويستطيع تعلّم كلمات وجمل قصيرة مع التدريب.",
    features: ["تكلفة رعاية منخفضة", "يتعلّم الكلام", "ألوان متعددة"],
    specs: [
      { label: "العمر", value: "2–3 أشهر" },
      { label: "متوسط العمر", value: "7–10 سنوات" },
      { label: "القدرة على الكلام", value: "جيدة" },
      { label: "الحجم", value: "18 سم" },
    ],
    art: "parrot",
    palette: { primary: "#7cc142", secondary: "#2f5d1f", accent: "#f7e04a", tint: "#eef7e3" },
  },
  {
    slug: "sun-conure",
    name: "ببغاء صن كونيور",
    category: "birds",
    price: 2800,
    stock: 3,
    short: "شمس صغيرة بألوان برتقالية وصفراء.",
    description:
      "الصن كونيور طائر مفعم بالحيوية وشديد التعلّق بصاحبه. ألوانه البرتقالية والصفراء تجعله من أجمل الطيور متوسطة الحجم.",
    features: ["مُربّى يدويًا", "شديد الألفة", "ألوان نادرة"],
    specs: [
      { label: "العمر", value: "5 أشهر" },
      { label: "متوسط العمر", value: "20–30 سنة" },
      { label: "القدرة على الكلام", value: "متوسطة" },
      { label: "الحجم", value: "30 سم" },
    ],
    art: "parrot",
    palette: { primary: "#f7a21b", secondary: "#2e9e5b", accent: "#f05a28", tint: "#fff1dc" },
    badge: "جديد",
    featured: true,
  },
  {
    slug: "large-steel-cage",
    name: "قفص ستانلس كبير للببغاوات",
    category: "cages",
    price: 1450,
    oldPrice: 1690,
    stock: 6,
    short: "مقاس 90×70×160 سم مع عجلات وصينية سحب.",
    description:
      "قفص من الستانلس ستيل المقاوم للصدأ والآمن تمامًا للطيور، بمسافة قضبان مناسبة للببغاوات المتوسطة والكبيرة، مع سقف قابل للفتح وصينية سهلة التنظيف.",
    features: ["ستانلس آمن غير سام", "عجلات بفرامل", "سقف ملعب قابل للفتح", "صينية سحب للتنظيف"],
    specs: [
      { label: "المقاس", value: "90×70×160 سم" },
      { label: "مسافة القضبان", value: "2.5 سم" },
      { label: "الخامة", value: "ستانلس 304" },
    ],
    art: "cage",
    palette: { primary: "#9aa5b1", secondary: "#5b6773", accent: "#e2b33c", tint: "#eef1f4" },
    featured: true,
  },
  {
    slug: "small-bird-cage",
    name: "قفص للطيور الصغيرة",
    category: "cages",
    price: 220,
    stock: 15,
    short: "مناسب للبادجي وطيور الحب والكوكاتيل.",
    description: "قفص خفيف مطلي بطلاء آمن، مزوّد بمجاثم خشبية وعلّاقتين للأكل والماء.",
    features: ["طلاء آمن", "مجاثم خشبية طبيعية", "باب واسع"],
    specs: [
      { label: "المقاس", value: "60×40×70 سم" },
      { label: "مسافة القضبان", value: "1.2 سم" },
    ],
    art: "cage",
    palette: { primary: "#f2f2f2", secondary: "#b5bcc4", accent: "#3fae49", tint: "#f1f6f1" },
  },
  {
    slug: "premium-seed-mix",
    name: "خلطة بذور بريميوم للببغاوات الكبيرة",
    category: "food",
    price: 115,
    stock: 40,
    short: "2 كجم — بذور وفواكه مجففة ومكسرات.",
    description:
      "خلطة متوازنة من البذور والحبوب والفواكه المجففة والمكسرات، خالية من الألوان الصناعية، مناسبة للكاسكو والمكاو والأمازون.",
    features: ["بدون ألوان صناعية", "غنية بالفيتامينات", "عبوة قابلة لإعادة الغلق"],
    specs: [
      { label: "الوزن", value: "2 كجم" },
      { label: "مناسبة لـ", value: "الببغاوات المتوسطة والكبيرة" },
    ],
    art: "food",
    palette: { primary: "#e8a33d", secondary: "#8a5a1f", accent: "#3fae49", tint: "#fbf0dc" },
    featured: true,
  },
  {
    slug: "pellets-small",
    name: "حبيبات غذائية متكاملة للطيور الصغيرة",
    category: "food",
    price: 60,
    stock: 50,
    short: "1 كجم — غذاء متكامل بتوصية بيطرية.",
    description: "حبيبات مصنوعة من الحبوب والخضروات تقدّم تغذية متكاملة وتقلل من انتقائية الطائر في الأكل.",
    features: ["تغذية متكاملة", "توصية بيطرية", "تقلل الهدر"],
    specs: [{ label: "الوزن", value: "1 كجم" }],
    art: "food",
    palette: { primary: "#7cc142", secondary: "#3b6b22", accent: "#f2c230", tint: "#eef7e3" },
  },
  {
    slug: "foraging-toy",
    name: "لعبة بحث عن الطعام (Foraging)",
    category: "toys",
    price: 55,
    stock: 25,
    short: "تحفّز الذكاء وتقلل التوتر ونتف الريش.",
    description: "لعبة من الخشب الطبيعي والحبال القطنية، تخبّئ فيها المكافآت ليبحث عنها الطائر، مما يشغل وقته وينمّي ذكاءه.",
    features: ["خشب طبيعي غير معالج", "حبال قطنية آمنة", "تقلل نتف الريش"],
    specs: [{ label: "مناسبة لـ", value: "جميع الأحجام" }],
    art: "toy",
    palette: { primary: "#f05a28", secondary: "#1f6fd1", accent: "#f7e04a", tint: "#fde9e1" },
    featured: true,
  },
  {
    slug: "rope-swing",
    name: "مرجيحة حبل ملوّنة",
    category: "toys",
    price: 29,
    stock: 35,
    short: "مرجيحة مرنة تقوّي القدمين.",
    description: "مرجيحة من الحبل القطني الملوّن بألوان طبيعية، تساعد على تقوية القدمين وتوفّر مكانًا مريحًا للجلوس.",
    features: ["ألوان طبيعية", "قابلة للغسيل", "تعليق سهل"],
    specs: [{ label: "الطول", value: "45 سم" }],
    art: "toy",
    palette: { primary: "#3fae49", secondary: "#f7a21b", accent: "#c8322b", tint: "#e6f5e7" },
  },
  {
    slug: "multivitamin",
    name: "فيتامينات متعددة للطيور",
    category: "care",
    price: 45,
    stock: 45,
    short: "تُضاف للماء — تدعم المناعة وجمال الريش.",
    description: "مكمّل غذائي سائل يحتوي على فيتامينات A وD3 وE ومجموعة B، يدعم المناعة وفترة تبديل الريش.",
    features: ["سهل الاستخدام", "يدعم تبديل الريش", "تركيبة بيطرية"],
    specs: [{ label: "الحجم", value: "100 مل" }],
    art: "care",
    palette: { primary: "#1f6fd1", secondary: "#0f3d7a", accent: "#f7e04a", tint: "#e4eefb" },
  },
  {
    slug: "nail-beak-kit",
    name: "طقم عناية بالمخالب والمنقار",
    category: "care",
    price: 75,
    stock: 18,
    short: "مقص آمن + مبرد + بودرة إيقاف نزيف.",
    description: "طقم متكامل للعناية الدورية بالمخالب والمنقار في المنزل بأمان، مع دليل استخدام مصوّر.",
    features: ["أدوات ستانلس", "بودرة إيقاف نزيف", "دليل مصوّر"],
    specs: [{ label: "المحتويات", value: "3 قطع" }],
    art: "care",
    palette: { primary: "#c8322b", secondary: "#7a1d18", accent: "#f2f2f2", tint: "#fbe5e3" },
  },
];

const bySlug = new Map(products.map((p) => [p.slug, p]));

export function getProduct(slug: string): Product | undefined {
  return bySlug.get(slug);
}

export function getCategory(id: CategoryId) {
  return categories.find((c) => c.id === id);
}

export function isCategoryId(value: string): value is CategoryId {
  return categories.some((c) => c.id === value);
}

export const MAX_QTY_PER_ITEM = 10;
