# ARES — Explorador de Marte

Protótipo para o desafio **Interplanetary Survival Guide: Martian Map**, NASA Space Apps 2026. Interface em português para comparar percursos em Jezero e planejar uma caminhada com pesquisa, retorno e reserva de autonomia.

## Executar no Windows

Na pasta `ares-marswalk`, execute:

```powershell
.\node.exe server.mjs
```

Abra **http://127.0.0.1:4173** no navegador. O runtime Node foi baixado na pasta do projeto e está ignorado pelo Git. Em outra máquina com Node instalado, use `node server.mjs`. Não há dependências npm nem etapa de compilação.

Também é possível dar dois cliques em `iniciar.cmd`. Mantenha o terminal aberto enquanto estiver usando o protótipo. Ctrl+C encerra o servidor.

## O que funciona

- Mapa com deslocamento, zoom, destinos selecionáveis e centralização da missão.
- Três camadas reais do NASA/JPL Mars Trek: CTX óptico, MOLA relevo e THEMIS infravermelho diurno.
- 52 tiles de Jezero armazenados localmente, incluindo contexto Viking sob as lacunas CTX, com URLs de origem e data de download em `dist/assets/data-manifest.json`.
- A* com desvio de zonas de exclusão de demonstração e comparação com linha direta.
- Distância de ida e volta, pesquisa, velocidade ajustável, autonomia disponível e reserva.
- Avisos de reserva insuficiente e de passagem por zona simulada.
- Exportação JSON com parâmetros, percurso em coordenadas marcianas, resultado e proveniência.
- Layout responsivo, controles por teclado e diálogo de fontes.

Os dados do mapa funcionam sem internet depois de baixar/copiar o projeto. As fontes tipográficas externas são opcionais e têm alternativas locais do sistema.

## Origem dos dados

Desafio informado pela equipe:
https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources

A aba oficial foi acessada no navegador em 14/11/2026. O **NASA/JPL Mars Trek está explicitamente listado em NASA DATA & RESOURCES** e é a origem das camadas integradas. O registro das referências está em `dist/assets/challenge-resources.json`.

Os outros recursos oficiais são os mapas geológicos USGS–NASA, a visualização de uma rota proposta do Curiosity, o NASA Worldview (dados da Terra, inspiração de interface) e a galeria de imagens brutas do Perseverance. São links complementares no diálogo de fontes, não fontes de camadas desta versão. Não foram usados projetos de outras equipes como código ou dados.

Produtos oficiais:

- `CTX_beta01_uncontrolled_5m_Caltech`: https://trek.nasa.gov/tiles/Mars/EQ/CTX_beta01_uncontrolled_5m_Caltech/1.0.0/WMTSCapabilities.xml
- `Mars_MGS_MOLA_ClrShade_merge_global_463m`: https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/WMTSCapabilities.xml
- `Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12_clon0_ly`: https://trek.nasa.gov/tiles/Mars/EQ/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12_clon0_ly/1.0.0/WMTSCapabilities.xml

Os níveis de visualização estão nos metadados; o tamanho nominal do produto não é a resolução final de cada tile. As camadas usam suas matrizes WMTS nativas. O mapa projeta as coordenadas em um plano equiretangular local, usando o raio equatorial de Marte (3.396.190 m).

Para repetir o download em PowerShell, leia e execute `fetch-data.ps1`. As políticas de execução do Windows podem exigir autorização. O script não pede chaves de API.

## Limites científicos do protótipo

- Habitat, destinos e zonas de exclusão são hipóteses de demonstração. Não são locais de uma missão humana nem obstáculos medidos.
- O roteamento evita apenas as zonas simuladas; não calcula a declividade nem detecta pedras ou dunas.
- MOLA é apresentado como relevo regional, não como modelo numérico para navegação local.
- THEMIS é um mosaico infravermelho histórico; o brilho não é convertido em temperatura ou previsão meteorológica.
- A velocidade é constante. Não há modelo de gasto de oxigênio, esforço fisiológico, fadiga, radiação, comunicação ou duração real de traje.
- “Dentro da autonomia” significa apenas que a soma do tempo estimado e da reserva cabe no orçamento definido.
- Sem cobertura do recorte local, o mapa mostra o esquema de coordenadas e avisa que a cartografia está indisponível.

## Validação

```powershell
.\node.exe --test tests/planner.test.mjs
.\node.exe --check dist/app.js
```

`qa-browser.mjs` verifica a interface em Chrome instalado no caminho padrão do Windows, com o servidor local em execução. As capturas e o download de teste ficam em `.local/`, fora do Git.

## Demonstração em dois minutos

1. Selecione “Margem do delta” e compare o desvio com a linha direta.
2. Alterne Óptico, Relevo e Infravermelho e explique suas resoluções e limites.
3. Reduza a autonomia para 60 minutos e mostre o aviso de reserva insuficiente.
4. Aumente a autonomia, selecione outro alvo e recalcule a missão.
5. Abra Dados & fontes e exporte o plano JSON.

## Próxima evolução

Integrar um modelo digital de terreno local de Jezero com referência espacial compatível com a imagem óptica, calcular declividade real e substituir as zonas hipotéticas por anotações rastreáveis. Essa etapa deve validar alinhamento, resolução e regiões sem dados antes de oferecer qualquer estimativa de dificuldade do terreno.
