import { useState } from "react";
import { Carousel } from "@mantine/carousel";
import type { EmblaCarouselType } from "embla-carousel";
import { Button } from "@kaistrum/stratum-ui";
import { IconShieldCheck, IconMapPin, IconWifiOff } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

const INTRO_SEEN_KEY = "faraja-intro-seen";

export function hasSeenIntro(): boolean {
	if (typeof window === "undefined") return true;
	return window.localStorage.getItem(INTRO_SEEN_KEY) === "1";
}

const SLIDES = [
	{ icon: IconShieldCheck, titleKey: "intro.slide1.title", bodyKey: "intro.slide1.body" },
	{ icon: IconMapPin, titleKey: "intro.slide2.title", bodyKey: "intro.slide2.body" },
	{ icon: IconWifiOff, titleKey: "intro.slide3.title", bodyKey: "intro.slide3.body" }
];

export default function IntroScreen({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation("common");
	const [embla, setEmbla] = useState<EmblaCarouselType | null>(null);
	const [current, setCurrent] = useState(0);
	const isLast = current === SLIDES.length - 1;

	const finish = () => {
		window.localStorage.setItem(INTRO_SEEN_KEY, "1");
		onDone();
	};

	return (
		<div className="fixed inset-0 z-50 flex flex-col bg-bg px-6 pb-8 pt-10">
			<div className="mb-2 flex justify-end">
				<Button variant="ghost" size="sm" onClick={finish}>
					{t("intro.skip")}
				</Button>
			</div>

			<Carousel
				getEmblaApi={(api) => setEmbla(api)}
				onSlideChange={setCurrent}
				withControls={false}
				style={{ flex: 1, overflow: "hidden" }}
				styles={{
					root: { height: "100%" },
					viewport: { height: "100%" },
					container: { height: "100%" }
				}}>
				{SLIDES.map(({ icon: Icon, titleKey, bodyKey }, i) => (
					<Carousel.Slide key={i}>
						<div className="flex h-full flex-col items-center justify-center gap-6 text-center">
							<div className="flex h-20 w-20 items-center justify-center rounded-full bg-bg-card text-accent">
								<Icon size={40} stroke={1.5} />
							</div>
							<div className="max-w-xs">
								<h2 className="mb-2 text-xl font-semibold text-text">{t(titleKey)}</h2>
								<p className="text-sm text-text-muted">{t(bodyKey)}</p>
							</div>
						</div>
					</Carousel.Slide>
				))}
			</Carousel>

			<div className="mt-6 flex flex-col items-center gap-4">
				<div className="flex gap-1.5">
					{SLIDES.map((_, i) => (
						<div
							key={i}
							className={`h-1.5 w-5 rounded-full transition-colors ${
								i === current ? "bg-accent" : "bg-border"
							}`}
						/>
					))}
				</div>
				<Button
					fullWidth
					size="md"
					variant="primary"
					onClick={isLast ? finish : () => embla?.scrollNext()}>
					{isLast ? t("intro.getStarted") : t("intro.next")}
				</Button>
			</div>
		</div>
	);
}
