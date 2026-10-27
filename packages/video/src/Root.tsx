import { Composition } from "remotion";
import { Explainer } from "./Explainer";
import { FPS, timeline, type ExplainerProps } from "./storyboard";
import { HEIGHT, WIDTH } from "./theme";
import { sampleProps } from "./sample";

export function Root() {
  return (
    <Composition
      id="Explainer"
      component={Explainer}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      durationInFrames={FPS * 10}
      defaultProps={sampleProps as ExplainerProps}
      calculateMetadata={({ props }: { props: ExplainerProps }) => ({
        durationInFrames: timeline(props.storyboard.scenes, props.readingSpeed).total,
      })}
    />
  );
}
