/**
 * Worker 类型环境检查专用补丁。
 * Worker tsconfig 不加载 DOM lib，其 TypedArray 的 toString 不含编码参数重载，
 * 导致 Node 平台共享服务中 Buffer#toString('hex') 在此类型环境下报 TS2554。
 * 通过 interface 合并补上带可选参数的重载，使跨平台共享代码在两种类型环境下均可通过检查。
 */
interface Uint8Array {
  toString(encoding?: string, start?: number, end?: number): string;
}