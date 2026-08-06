import { Controller, Get, Post, Body, Req, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { CurrencyService } from './currency.service';
import { AuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';
import { z } from 'zod';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly currencyService: CurrencyService,
  ) {}

  @Get('currencies')
  getCurrencies() {
    const currencies = this.currencyService.getAllCurrencies();
    return { success: true, data: currencies };
  }

  @Get('token-packs')
  async getTokenPacks(@Query('currency') currency?: string) {
    const data = await this.paymentsService.getTokenPacks(currency || 'XOF');
    return { success: true, data };
  }

  @Post('convert')
  convert(@Body() body: any) {
    const schema = z.object({
      amount: z.number().positive(),
      fromCurrency: z.string().default('XOF'),
      toCurrency: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid body' } });

    const tokens = this.currencyService.calculateTokensForFiat(parsed.data.amount, parsed.data.fromCurrency);
    const convertedFiat = parsed.data.toCurrency
      ? this.currencyService.convertFiat(parsed.data.amount, parsed.data.fromCurrency, parsed.data.toCurrency)
      : undefined;

    return {
      success: true,
      data: {
        amount: parsed.data.amount,
        fromCurrency: parsed.data.fromCurrency,
        tokens,
        convertedFiat,
        toCurrency: parsed.data.toCurrency,
      },
    };
  }

  @Post('buy-tokens')
  @UseGuards(AuthGuard)
  async buyTokens(@Req() req: Request, @Body() body: any) {
    const schema = z.object({
      packId: z.string(),
      currency: z.string().default('XOF'),
      paymentProvider: z.enum(['STRIPE', 'CINETPAY']).default('CINETPAY'),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid body' } });
    const data = await this.paymentsService.buyTokens(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Post('pay-with-tokens')
  @UseGuards(AuthGuard)
  async payWithTokens(@Req() req: Request, @Body() body: any) {
    const schema = z.object({
      type: z.enum(['TRACK', 'ALBUM', 'CLIP']),
      itemId: z.string(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid body' } });
    const data = await this.paymentsService.payWithTokens(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  @Get('token-history')
  @UseGuards(AuthGuard)
  async getTokenHistory(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    const userId = req.user!.userId;
    const data = await this.paymentsService.getTokenHistory(userId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      type,
    });
    return { success: true, data };
  }

  @Post('buy-track')
  @UseGuards(AuthGuard)
  async buyTrack(@Req() req: Request, @Body() body: any) {
    const schema = z.object({
      trackId: z.string(),
      currency: z.string().default('XOF'),
      paymentProvider: z.enum(['STRIPE', 'CINETPAY']).default('CINETPAY'),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ success: false, error: { message: 'Invalid body' } });
    const data = await this.paymentsService.buyTrack(req.user!.userId, parsed.data);
    return { success: true, data };
  }

  /**
   * CinetPay webhook — skip rate limiting (called by CinetPay servers)
   * Security: HMAC signature is verified inside the service
   */
  @Post('webhook/cinetpay')
  @SkipThrottle()
  async cinetPayWebhook(@Body() body: any) {
    await this.paymentsService.handleCinetPayWebhook(body);
    return { received: true };
  }

  /**
   * Stripe webhook — skip rate limiting (called by Stripe servers)
   * Security: Stripe signature is verified inside the service
   */
  @Post('webhook/stripe')
  @SkipThrottle()
  async stripeWebhook(@Req() req: Request) {
    const sig = req.headers['stripe-signature'] as string;
    await this.paymentsService.handleStripeWebhook((req as any).rawBody, sig);
    return { received: true };
  }
}
