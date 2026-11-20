import { RichComponent } from "../RichComponent";
import { RICH_COMPONENTS_EXAMPLES } from "../../lib/rich-components-examples";

export function ComponentsGallery() {
  return <section className="settings-box gx-components-gallery" aria-labelledby="gx-components-gallery-title">
    <h2 id="gx-components-gallery-title">Galeria de componentes</h2>
    <p>Exemplos dos componentes visuais que podem aparecer nas respostas.</p>
    <div className="gx-components-gallery-grid">{RICH_COMPONENTS_EXAMPLES.map((example) => <article key={`${example.tipo}-${example.titulo}`}><h3>{example.titulo}</h3><RichComponent component={example.component} /></article>)}</div>
  </section>;
}
