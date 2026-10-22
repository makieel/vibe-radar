// Stopwords for keyword extraction and title clustering: general English,
// HN boilerplate words, and Korean particles / boilerplate.
const ENGLISH = `
the and for are but not you all any can had her was one our out has have been were they this that with from will
would there their what about which when your how why who whom whose into than then them these those some such only
other more most also just very over under again further once here where while during before after above below
between both each few own same too its it's don't doesn't didn't isn't aren't wasn't can't won't i'm i've you're
we're we've they're let's what's that's there's here's today's yet via per off onto upon within without across
through against among around because being does did doing done get gets got getting make makes made making use uses
used today may might must shall should could much many even still ever never always often really actually
`;
const HN = `
show ask launch launches launched release releases released new using thought uncover uncovers uncovered
introducing introduces announcing announces announced now first second part guide tutorial review update updates
updated version how-to lessons learned why what who top best free open
`;
const KOREAN = `
이번 공개 출시 발표 소개 업데이트 관련 대한 위한 통해 따라 기반 이후 이전 최근 오늘 어제 내일 현재 지금 그리고 하지만
그러나 또한 에서 으로 에게 까지 부터 보다 처럼 만큼 같은 있는 없는 하는 되는 있다 없다 한다 된다 합니다 입니다 있습니다
위해 대해 통한 등의 등을 하기 하고 해서 이다 라는 라고 에서의 방법 사용 만들기 정리 후기 이유
`;

export const STOPWORDS: ReadonlySet<string> = new Set(
  `${ENGLISH} ${HN} ${KOREAN}`.split(/\s+/).filter(Boolean),
);
