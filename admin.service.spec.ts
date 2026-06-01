import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { createMock } from '@golevelup/ts-jest';
import { NumbersService } from '../numbers/numbers.service';

describe('AdminService', () => {
  let service: AdminService;
  let prismaService: PrismaService;
  let redisService: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: createMock<PrismaService>({
            $transaction: jest.fn().mockImplementation((cb) => cb(prismaService)),
          }),
        },
        {
          provide: RedisService,
          useValue: createMock<RedisService>({
            isConfigured: jest.fn().mockReturnValue(false),
          }),
        },
        {
          provide: NumbersService,
          useValue: createMock<NumbersService>(),
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
