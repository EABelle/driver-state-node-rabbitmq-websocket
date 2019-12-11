FROM node:10.15

ENV AMQP_URL amqp://guest:guest@rabbitmq:5672
ENV N 1500
ENV GROWTH 30000
ENV UNTRUSTWORTHY_DRIVERS_RATIO .50

ADD . /code
WORKDIR /code
RUN npm install --production
CMD ["npm", "start"]
