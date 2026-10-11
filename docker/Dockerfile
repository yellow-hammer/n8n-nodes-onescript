FROM node:24-bookworm-slim

ENV LANG=C.UTF-8 \
	LC_ALL=C.UTF-8

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl unzip tini libicu72 \
	&& curl -fsSL -o /tmp/onescript.zip https://oscript.io/downloads/2_2_1/scd-lin/x64.zip \
	&& unzip -q /tmp/onescript.zip -d /opt/onescript \
	&& chmod +x /opt/onescript/bin/oscript /opt/onescript/bin/opm \
	&& rm /tmp/onescript.zip \
	&& rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/onescript/bin:${PATH}" \
	N8N_CUSTOM_EXTENSIONS=/opt/n8n-nodes-onescript/dist \
	GENERIC_TIMEZONE=Europe/Moscow \
	TZ=Europe/Moscow \
	N8N_HOST=0.0.0.0 \
	N8N_PORT=5678 \
	N8N_PROTOCOL=http \
	N8N_SECURE_COOKIE=false

RUN oscript -version \
	&& opm install autumn \
	&& npm install -g n8n@2.42.6

WORKDIR /root
EXPOSE 5678
ENTRYPOINT ["tini", "--"]
CMD ["n8n", "start"]
